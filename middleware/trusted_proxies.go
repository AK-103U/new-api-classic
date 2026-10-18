package middleware

import (
	"log"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func ConfigureTrustedProxies(engine *gin.Engine) error {
	trustedProxies, usedDefaults, err := common.ResolveTrustedProxies(os.Getenv("TRUSTED_PROXIES"))
	if err != nil {
		return err
	}
	if usedDefaults {
		log.Print(common.LogText("WARNING: TRUSTED_PROXIES is unset or blank; trusting loopback, RFC 1918, and IPv6 ULA proxy addresses for compatibility. Set TRUSTED_PROXIES=none to trust no proxies, or configure explicit proxy IPs/CIDRs to replace these defaults."))
	}
	if err := common.ConfigureTrustedProxies(engine, trustedProxies); err != nil {
		return err
	}

	// When deployed behind Cloudflare (or another known platform), read the
	// real client IP from the platform-provided header instead of parsing
	// X-Forwarded-For. Set TRUSTED_PLATFORM=CF-Connecting-IP in production.
	platform := common.ResolveTrustedPlatform(os.Getenv("TRUSTED_PLATFORM"))
	if platform != "" {
		log.Print(common.LogText("using trusted platform header: %s", platform))
	}
	common.ConfigureTrustedPlatform(engine, platform)
	return nil
}
