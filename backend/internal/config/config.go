package config

import (
	"os"
	"time"
)

// Config holds application configuration loaded from environment variables.
type Config struct {
	Port           string
	MongoURI       string
	MongoDatabase  string
	JWTSecret      string
	GinMode        string
	TokenTTL       time.Duration
	CookieName     string
	CookieDomain   string
	CookieSecure   bool
	CookieSameSite string
	// Cloudinary configuration
	CloudinaryURL       string // CLOUDINARY_URL format: cloudinary://api_key:api_secret@cloud_name
	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

// Load reads configuration from environment variables and applies sane defaults.
func Load() *Config {
	cfg := &Config{
		Port:          getEnv("PORT", "8080"),
		MongoURI:      getEnv("MONGODB_URI", "mongodb://localhost:27017"),
		MongoDatabase: getEnv("MONGODB_DATABASE", "generative_art_marketplace"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret"),
		GinMode:       getEnv("GIN_MODE", "debug"),
		CookieName:    getEnv("AUTH_TOKEN_NAME", "auth_token"),
		// 7 days expiry by default
		TokenTTL:       7 * 24 * time.Hour,
		CookieSecure:   getEnv("COOKIE_SECURE", "false") == "true",
		CookieDomain:   getEnv("COOKIE_DOMAIN", ""),
		CookieSameSite: getEnv("COOKIE_SAMESITE", "lax"),
		// Cloudinary configuration
		CloudinaryURL:       getEnv("CLOUDINARY_URL", ""),
		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
	}

	return cfg
}

func getEnv(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}


