package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ReportHandler struct {
	db *database.MongoDB
}

func NewReportHandler(db *database.MongoDB) *ReportHandler {
	return &ReportHandler{db: db}
}

func (h *ReportHandler) CreateReport(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		TargetType string `json:"targetType" binding:"required"`
		TargetID   string `json:"targetId" binding:"required"`
		Reason     string `json:"reason" binding:"required"`
		Details    string `json:"details"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	targetType := strings.ToLower(strings.TrimSpace(req.TargetType))
	if targetType != "artwork" && targetType != "comment" && targetType != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "targetType must be artwork, comment, or user"})
		return
	}

	targetOID, err := primitive.ObjectIDFromHex(req.TargetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid targetId"})
		return
	}

	report := models.Report{
		ReporterID: userID.(primitive.ObjectID),
		TargetType: targetType,
		TargetID:   targetOID,
		Reason:     strings.TrimSpace(req.Reason),
		Details:    strings.TrimSpace(req.Details),
		CreatedAt:  time.Now(),
	}
	if _, err := h.db.Reports().InsertOne(context.TODO(), report); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit report"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Report submitted. Our team will review it."})
}
