package controller

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPerfMetricsSummaryGroupFilter(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db, dsn := newAuditTestDatabase(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.Option{}))
			connection, err := db.DB()
			require.NoError(t, err)
			require.NoError(t, connection.Close())
			oldDB, oldPath, oldMaster, oldRedis := model.DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled
			oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
			oldGroups := ratio_setting.GroupRatio2JSONString()
			t.Cleanup(func() {
				model.DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled = oldDB, oldPath, oldMaster, oldRedis
				common.SetDatabaseTypes(oldMain, oldLog)
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(oldGroups))
			})
			common.IsMasterNode, common.RedisEnabled = false, false
			if dialect.kind == "sqlite" {
				common.SQLitePath, dsn = dsn, "local"
			}
			t.Setenv("SQL_DSN", dsn)
			t.Setenv("LOG_SQL_DSN", "")
			require.NoError(t, model.InitDB())
			db = model.DB
			connection, err = db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, connection.Close()) })
			require.NoError(t, db.AutoMigrate(&model.PerfMetric{}))
			require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"premium":2,"unused":1}`))

			versionQuery := "SELECT version()"
			if dialect.kind == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)

			hour := time.Now().Truncate(time.Hour).Add(-time.Hour).Unix()
			historyHour := hour - 48*3600
			require.NoError(t, db.Create(&[]model.PerfMetric{
				{ModelName: "group-filter-model", Group: "default", BucketTs: hour, RequestCount: 3, SuccessCount: 3, TotalLatencyMs: 3000, OutputTokens: 30, GenerationMs: 3000},
				{ModelName: "group-filter-model", Group: "premium", BucketTs: hour, RequestCount: 1, TotalLatencyMs: 3000},
				{ModelName: "group-filter-model", Group: "auto", BucketTs: hour, RequestCount: 1, SuccessCount: 1, TotalLatencyMs: 2000, OutputTokens: 40, GenerationMs: 2000},
				{ModelName: "group-filter-model", Group: "inactive", BucketTs: hour, RequestCount: 100},
				{ModelName: "group-filter-idle", Group: "default", BucketTs: historyHour, RequestCount: 1, SuccessCount: 1},
			}).Error)

			for _, tc := range []struct {
				name    string
				group   string
				want    *perfmetrics.Summary
				history bool
			}{
				{"all configured groups", "", &perfmetrics.Summary{SuccessRate: 80, AvgLatencyMs: 1600, AvgTps: 14}, true},
				{"default only", "default", &perfmetrics.Summary{SuccessRate: 100, AvgLatencyMs: 1000, AvgTps: 10}, true},
				{"premium failures stay isolated", "premium", &perfmetrics.Summary{SuccessRate: 0, AvgLatencyMs: 3000, AvgTps: 0}, false},
				{"auto only", "auto", &perfmetrics.Summary{SuccessRate: 100, AvgLatencyMs: 2000, AvgTps: 20}, false},
				{"configured group without samples", "unused", nil, false},
				{"inactive group is not exposed", "inactive", nil, false},
				{"unknown group never falls back to all", "unknown", nil, false},
			} {
				t.Run(tc.name, func(t *testing.T) {
					params := url.Values{"hours": {"24"}, "recent_model": {"group-filter-model", "group-filter-idle"}}
					if tc.group != "" {
						params.Set("group", tc.group)
					}
					recorder := httptest.NewRecorder()
					ctx, _ := gin.CreateTestContext(recorder)
					ctx.Request = httptest.NewRequest(http.MethodGet, "/api/perf-metrics/summary?"+params.Encode(), nil)
					GetPerfMetricsSummary(ctx)
					require.Equal(t, http.StatusOK, recorder.Code)
					var response struct {
						Success bool                         `json:"success"`
						Data    perfmetrics.SummaryAllResult `json:"data"`
					}
					require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
					require.True(t, response.Success)
					if tc.want == nil {
						assert.Nil(t, response.Data.Summary)
						assert.Empty(t, response.Data.Models)
						assert.Empty(t, response.Data.RecentSuccessSeries)
						return
					}
					models := make(map[string]perfmetrics.ModelSummary)
					for _, summary := range response.Data.Models {
						models[summary.ModelName] = summary
					}
					require.Contains(t, models, "group-filter-model")
					got := models["group-filter-model"]
					assert.Equal(t, *tc.want, perfmetrics.Summary{SuccessRate: got.SuccessRate, AvgLatencyMs: got.AvgLatencyMs, AvgTps: got.AvgTps})
					assert.Equal(t, []perfmetrics.SuccessRatePoint{{Ts: hour, SuccessRate: tc.want.SuccessRate}}, got.RecentSuccessSeries)
					assert.Equal(t, got.RecentSuccessSeries, response.Data.RecentSuccessSeries["group-filter-model"])
					if tc.history {
						assert.Equal(t, []perfmetrics.SuccessRatePoint{{Ts: historyHour, SuccessRate: 100}}, response.Data.RecentSuccessSeries["group-filter-idle"])
					} else {
						assert.NotContains(t, models, "group-filter-idle")
						assert.Empty(t, response.Data.RecentSuccessSeries["group-filter-idle"])
					}
				})
			}
		})
	}
}
