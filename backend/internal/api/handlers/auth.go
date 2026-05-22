package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/auth"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
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
		Username:  req.Username,
		Email:     req.Email,
		Password:  string(hash),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
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

