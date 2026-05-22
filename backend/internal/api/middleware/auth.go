package middleware

import (
	"net/http"
	"strings"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/pkg/auth"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AuthMiddleware validates JWT from HTTP-only cookie or Authorization header and
// injects the userID into the context.
func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := getTokenFromRequest(c, cfg)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}

		claims, err := auth.ParseAndValidate(cfg.JWTSecret, token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		userID, err := primitive.ObjectIDFromHex(claims.UserID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
			return
		}

		c.Set("userID", userID)
		c.Set("userEmail", claims.Email)
		c.Next()
	}
}

// OptionalAuthMiddleware sets userID when a valid token is present but does not require auth.
func OptionalAuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := getTokenFromRequest(c, cfg)
		if token != "" {
			claims, err := auth.ParseAndValidate(cfg.JWTSecret, token)
			if err == nil {
				if userID, err := primitive.ObjectIDFromHex(claims.UserID); err == nil {
					c.Set("userID", userID)
				}
			}
		}
		c.Next()
	}
}

func getTokenFromRequest(c *gin.Context, cfg *config.Config) string {
	// Prefer HTTP-only cookie
	if cookie, err := c.Cookie(cfg.CookieName); err == nil && cookie != "" {
		return cookie
	}

	// Fallback to Authorization header (useful for WS handshake)
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	return ""
}

