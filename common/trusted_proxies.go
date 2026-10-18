package common

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
)

var defaultTrustedProxyCIDRs = []string{
	"127.0.0.0/8",
	"::1",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
}

// ResolveTrustedProxies parses TRUSTED_PROXIES without applying it to an
// engine. The returned slice can be reused by the outer and plugin engines.
func ResolveTrustedProxies(raw string) (trustedProxies []string, usedDefaults bool, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return append([]string(nil), defaultTrustedProxyCIDRs...), true, nil
	}
	if strings.EqualFold(raw, "none") {
		return nil, false, nil
	}

	parts := strings.Split(raw, ",")
	trustedProxies = make([]string, 0, len(parts))
	for _, part := range parts {
		trustedProxy := strings.TrimSpace(part)
		if trustedProxy == "" {
			continue
		}
		if strings.EqualFold(trustedProxy, "none") {
			return nil, false, errors.New("TRUSTED_PROXIES=none must be used alone")
		}
		trustedProxies = append(trustedProxies, trustedProxy)
	}
	if len(trustedProxies) == 0 {
		return nil, false, errors.New("TRUSTED_PROXIES does not contain an IP address or CIDR")
	}
	return trustedProxies, false, nil
}

// ResolveTrustedPlatform returns the TRUSTED_PLATFORM env value (e.g.
// "CF-Connecting-IP") after trimming whitespace. An empty string means the
// feature is disabled and Gin falls back to X-Forwarded-For / X-Real-Ip
// parsing via TrustedProxies.
func ResolveTrustedPlatform(raw string) string {
	return strings.TrimSpace(raw)
}

func ConfigureTrustedProxies(engine *gin.Engine, trustedProxies []string) error {
	if err := engine.SetTrustedProxies(trustedProxies); err != nil {
		return fmt.Errorf("invalid TRUSTED_PROXIES: %w", err)
	}
	return nil
}

// ConfigureTrustedPlatform sets engine.TrustedPlatform when a non-empty
// platform header is provided. When deploying behind Cloudflare set
// TRUSTED_PLATFORM=CF-Connecting-IP so that c.ClientIP() reads the real
// client IP directly from that header instead of parsing X-Forwarded-For.
func ConfigureTrustedPlatform(engine *gin.Engine, platform string) {
	if platform != "" {
		engine.TrustedPlatform = platform
	}
}
