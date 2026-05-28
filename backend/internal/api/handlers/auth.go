package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/auth"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db  *database.MongoDB
	cfg *config.Config
}

func NewAuthHandler(db *database.MongoDB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		db:  db,
		cfg: cfg,
	}
}

// Register creates a new user.
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// Uniqueness checks
	count, _ := h.db.Users().CountDocuments(context.TODO(), bson.M{
		"$or": []bson.M{{"email": req.Email}, {"username": req.Username}},
	})
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user"})
		return
	}

	user := models.User{
		Username:          req.Username,
		Email:             req.Email,
		Password:          string(hash),
		NotificationPrefs: models.DefaultNotificationPrefs(),
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	result, err := h.db.Users().InsertOne(context.TODO(), user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user"})
		return
	}

	user.ID = result.InsertedID.(primitive.ObjectID)
	user.Password = ""

	c.JSON(http.StatusCreated, user)
}

// Login authenticates and issues a JWT in an HTTP-only cookie.
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"email": strings.ToLower(req.Email)}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := auth.GenerateToken(h.cfg.JWTSecret, user.ID, user.Email, h.cfg.TokenTTL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	setAuthCookie(c, token, h.cfg)

	user.Password = ""
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// Logout clears the auth cookie so the session cannot be reused.
func (h *AuthHandler) Logout(c *gin.Context) {
	clearAuthCookie(c, h.cfg)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func setAuthCookie(c *gin.Context, token string, cfg *config.Config) {
	sameSite := http.SameSiteLaxMode
	if strings.ToLower(cfg.CookieSameSite) == "strict" {
		sameSite = http.SameSiteStrictMode
	} else if strings.ToLower(cfg.CookieSameSite) == "none" {
		sameSite = http.SameSiteNoneMode
	}

	c.SetSameSite(sameSite)
	c.SetCookie(
		cfg.CookieName,
		token,
		int(cfg.TokenTTL.Seconds()),
		"/",
		cfg.CookieDomain,
		cfg.CookieSecure,
		true, // httpOnly
	)
}

func clearAuthCookie(c *gin.Context, cfg *config.Config) {
	sameSite := http.SameSiteLaxMode
	if strings.ToLower(cfg.CookieSameSite) == "strict" {
		sameSite = http.SameSiteStrictMode
	} else if strings.ToLower(cfg.CookieSameSite) == "none" {
		sameSite = http.SameSiteNoneMode
	}

	c.SetSameSite(sameSite)
	c.SetCookie(cfg.CookieName, "", -1, "/", cfg.CookieDomain, cfg.CookieSecure, true)
}

// ForgotPassword creates a reset token (returned in response for dev; wire email in production).
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"email": email}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "If that email exists, a reset link has been sent."})
		return
	}

	tokenBytes := make([]byte, 32)
	_, _ = rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	_, _ = h.db.PasswordResets().DeleteMany(context.TODO(), bson.M{"email": email})
	reset := models.PasswordReset{
		Email:     email,
		Token:     token,
		ExpiresAt: time.Now().Add(1 * time.Hour),
		Used:      false,
		CreatedAt: time.Now(),
	}
	_, _ = h.db.PasswordResets().InsertOne(context.TODO(), reset)

	c.JSON(http.StatusOK, gin.H{
		"message":    "If that email exists, a reset link has been sent.",
		"resetToken": token,
	})
}

// ResetPassword sets a new password using a valid reset token.
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var reset models.PasswordReset
	err := h.db.PasswordResets().FindOne(context.TODO(), bson.M{
		"token": req.Token, "used": false, "expiresAt": bson.M{"$gt": time.Now()},
	}).Decode(&reset)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset token"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not reset password"})
		return
	}

	_, _ = h.db.Users().UpdateOne(context.TODO(), bson.M{"email": reset.Email}, bson.M{
		"$set": bson.M{"password": string(hash), "updatedAt": time.Now()},
	})
	_, _ = h.db.PasswordResets().UpdateOne(context.TODO(), bson.M{"_id": reset.ID}, bson.M{"$set": bson.M{"used": true}})

	c.JSON(http.StatusOK, gin.H{"message": "Password updated. You can sign in now."})
}

// Ping returns a short-lived token for WebSocket auth when cookie session is active.
func (h *AuthHandler) Ping(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	userObjID, ok := userID.(primitive.ObjectID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session user"})
		return
	}
	emailVal, _ := c.Get("userEmail")
	email, _ := emailVal.(string)
	token, err := auth.GenerateToken(h.cfg.JWTSecret, userObjID, email, h.cfg.TokenTTL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to issue token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}
