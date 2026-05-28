package handlers

import "github.com/gin-gonic/gin"

func extractWSToken(c *gin.Context, cookieName string) string {
	authHeader := c.GetHeader("Authorization")
	if len(authHeader) > 7 && (authHeader[:7] == "Bearer " || authHeader[:7] == "bearer ") {
		return authHeader[7:]
	}
	if t, err := c.Cookie(cookieName); err == nil && t != "" {
		return t
	}
	// Support token via query param or Sec-WebSocket-Protocol for browsers
	if t := c.Query("token"); t != "" {
		return t
	}
	// Use canonical header key: "Sec-Websocket-Protocol" (lowercase 'socket')
	if protocol := c.Request.Header.Get("Sec-Websocket-Protocol"); protocol != "" {
		return protocol
	}
	return ""
}
