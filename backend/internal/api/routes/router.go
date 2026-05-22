package routes

import (
	"generative-art-marketplace/internal/api/handlers"
	"generative-art-marketplace/internal/api/middleware"
	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/websocket"
	"generative-art-marketplace/pkg/cloudinary"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
)

// Register attaches all REST and WebSocket routes to Gin engine.
func Register(r *gin.Engine, db *database.MongoDB, wsHub *websocket.Hub, cfg *config.Config, cloudinaryService *cloudinary.Service) {
	artworkHandler := handlers.NewArtworkHandler(db, cfg, cloudinaryService)
	sessionHandler := handlers.NewSessionHandler(db, wsHub, cfg)
	userHandler := handlers.NewUserHandler(db, cfg, cloudinaryService)
	authHandler := handlers.NewAuthHandler(db, cfg)

	api := r.Group("/api/v1")

	// Auth
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/login", authHandler.Login)

	// Public data
	api.GET("/artworks", artworkHandler.GetArtworks)
	api.GET("/artworks/:id", artworkHandler.GetArtwork)
	api.POST("/artworks/:id/view", middleware.OptionalAuthMiddleware(cfg), artworkHandler.RecordArtworkView)
	api.POST("/artworks/generate", artworkHandler.GeneratePreview)
	api.GET("/artworks/:id/comments", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetComments)
	api.GET("/artworks/featured", artworkHandler.GetFeaturedArtworks)
	api.GET("/artworks/trending", artworkHandler.GetTrendingArtworks)
	api.GET("/artworks/search", artworkHandler.SearchArtworks)

	api.GET("/users/:username", middleware.OptionalAuthMiddleware(cfg), userHandler.GetUserProfile)
	api.GET("/users/:username/artworks", middleware.OptionalAuthMiddleware(cfg), userHandler.GetUserArtworks)
	api.GET("/users/:username/liked", middleware.OptionalAuthMiddleware(cfg), userHandler.GetUserLikedArtworks)
	api.GET("/users/:username/collections", middleware.OptionalAuthMiddleware(cfg), userHandler.GetUserCollections)
	api.GET("/users/search", userHandler.SearchUsers)

	api.GET("/sessions", sessionHandler.GetSessions)
	api.GET("/sessions/:id", sessionHandler.GetSession)

	// Protected routes
	protected := api.Group("/")
	protected.Use(middleware.AuthMiddleware(cfg))

	// Artworks
	protected.POST("/artworks", artworkHandler.CreateArtwork)
	protected.PUT("/artworks/:id", artworkHandler.UpdateArtwork)
	protected.DELETE("/artworks/:id", artworkHandler.DeleteArtwork)
	protected.POST("/artworks/:id/like", artworkHandler.LikeArtwork)
	protected.DELETE("/artworks/:id/like", artworkHandler.UnlikeArtwork)
	protected.POST("/artworks/:id/comments", artworkHandler.AddComment)
	protected.PUT("/artworks/:id/comments/:commentId", artworkHandler.UpdateComment)
	protected.DELETE("/artworks/:id/comments/:commentId", artworkHandler.DeleteComment)
	protected.POST("/artworks/:id/comments/:commentId/like", artworkHandler.LikeComment)
	protected.DELETE("/artworks/:id/comments/:commentId/like", artworkHandler.UnlikeComment)
	protected.POST("/artworks/:id/bookmark", artworkHandler.BookmarkArtwork)
	protected.DELETE("/artworks/:id/bookmark", artworkHandler.UnbookmarkArtwork)
	protected.POST("/artworks/:id/purchase", artworkHandler.PurchaseArtwork)

	// Users
	protected.GET("/users/me", userHandler.GetMe)
	protected.PUT("/users/me", userHandler.UpdateProfile)
	protected.POST("/users/:id/follow", userHandler.FollowUser)
	protected.DELETE("/users/:id/follow", userHandler.UnfollowUser)
	protected.GET("/me/following", userHandler.GetFollowing)
	protected.GET("/me/followers", userHandler.GetFollowers)
	protected.GET("/me/notifications", userHandler.GetNotifications)
	protected.POST("/me/notifications/:id/read", userHandler.MarkNotificationAsRead)
	protected.POST("/me/notifications/read-all", userHandler.MarkAllNotificationsAsRead)
	protected.GET("/me/dashboard", userHandler.GetDashboardStats)
	protected.GET("/me/analytics", userHandler.GetAnalytics)

	// Sessions
	protected.POST("/sessions", sessionHandler.CreateSession)
	protected.POST("/sessions/:id/join", sessionHandler.JoinSession)
	protected.POST("/sessions/:id/leave", sessionHandler.LeaveSession)
	protected.DELETE("/sessions/:id", sessionHandler.DeleteSession)

	// Websocket endpoint
	r.GET("/ws/sessions/:id", func(c *gin.Context) {
		sessionHandler.HandleWebSocket(c)
	})
}

