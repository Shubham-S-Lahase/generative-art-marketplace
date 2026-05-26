package handlers

import (
	"context"
	"net/http"
	"time"

	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
)

type MiscHandler struct {
	db *database.MongoDB
}

func NewMiscHandler(db *database.MongoDB) *MiscHandler {
	return &MiscHandler{db: db}
}

func (h *MiscHandler) Health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	dbOK := true
	if err := h.db.Client.Ping(ctx, nil); err != nil {
		dbOK = false
	}

	status := http.StatusOK
	body := gin.H{
		"status":    "ok",
		"database":  dbOK,
		"timestamp": time.Now().UTC(),
	}
	if !dbOK {
		status = http.StatusServiceUnavailable
		body["status"] = "degraded"
	}
	c.JSON(status, body)
}
