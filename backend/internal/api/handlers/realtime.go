package handlers

import (
	"net/http"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/websocket"
	"generative-art-marketplace/pkg/auth"

	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
)

type RealtimeHandler struct {
	cfg     *config.Config
	userHub *websocket.UserHub
}

func NewRealtimeHandler(cfg *config.Config, userHub *websocket.UserHub) *RealtimeHandler {
	return &RealtimeHandler{cfg: cfg, userHub: userHub}
}

// HandleUserEventsWS upgrades and subscribes the authenticated user to realtime events.
func (h *RealtimeHandler) HandleUserEventsWS(c *gin.Context) {
	token := extractWSToken(c, h.cfg.CookieName)
	claims, err := auth.ParseAndValidate(h.cfg.JWTSecret, token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	upgrader := ws.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &websocket.UserClient{
		Conn:   conn,
		UserID: claims.UserID,
		Send:   make(chan []byte, 256),
	}
	h.userHub.Register(claims.UserID, client)

	// Writer pump
	go func() {
		for msg := range client.Send {
			if err := conn.WriteMessage(ws.TextMessage, msg); err != nil {
				break
			}
		}
	}()

	// Reader pump (keepalive + graceful close)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	h.userHub.Unregister(claims.UserID, client)
	conn.Close()
}
