package routes

import (
	"time"

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
	marketplaceHandler := handlers.NewMarketplaceHandler(db, cfg)
	sessionHandler := handlers.NewSessionHandler(db, wsHub, cfg)
	userHandler := handlers.NewUserHandler(db, cfg, cloudinaryService)
	authHandler := handlers.NewAuthHandler(db, cfg)
	reportHandler := handlers.NewReportHandler(db)
	presetHandler := handlers.NewPresetHandler(db)
	miscHandler := handlers.NewMiscHandler(db)
	discoveryHandler := handlers.NewDiscoveryHandler(db)
	messageHandler := handlers.NewMessageHandler(db)

	rateLimit := middleware.RateLimit(120, time.Minute)

	api := r.Group("/api/v1")
	api.Use(rateLimit)

	api.GET("/health", miscHandler.Health)
	api.GET("/discovery/trending-tags", discoveryHandler.GetTrendingTags)
	api.GET("/discovery/popular-searches", discoveryHandler.GetPopularSearches)
	api.POST("/discovery/search-log", middleware.OptionalAuthMiddleware(cfg), discoveryHandler.RecordSearch)

	// Auth
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/logout", authHandler.Logout)
	api.POST("/auth/forgot-password", authHandler.ForgotPassword)
	api.POST("/auth/reset-password", authHandler.ResetPassword)

	// Public data (static artwork paths before :id)
	api.GET("/artworks", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetArtworks)
	api.GET("/artworks/featured", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetFeaturedArtworks)
	api.GET("/artworks/trending", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetTrendingArtworks)
	api.GET("/artworks/search", middleware.OptionalAuthMiddleware(cfg), artworkHandler.SearchArtworks)
	api.GET("/artworks/search/by-color", middleware.OptionalAuthMiddleware(cfg), artworkHandler.SearchArtworksByColor)
	api.POST("/artworks/generate", artworkHandler.GeneratePreview)
	api.POST("/artworks/preview/delete", artworkHandler.DeletePreview)
	api.GET("/artworks/:id", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetArtwork)
	api.GET("/artworks/:id/similar", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetSimilarArtworks)
	api.POST("/artworks/:id/view", middleware.OptionalAuthMiddleware(cfg), artworkHandler.RecordArtworkView)
	api.GET("/artworks/:id/comments", middleware.OptionalAuthMiddleware(cfg), artworkHandler.GetComments)
	api.GET("/artworks/:id/ownership", middleware.OptionalAuthMiddleware(cfg), marketplaceHandler.GetArtworkOwnership)

	api.GET("/presets", middleware.OptionalAuthMiddleware(cfg), presetHandler.ListPresets)

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

	protected.GET("/auth/ping", authHandler.Ping)

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
	protected.GET("/artworks/:id/checkout-quote", marketplaceHandler.GetCheckoutQuote)
	protected.POST("/artworks/:id/purchase", marketplaceHandler.PurchaseArtwork)
	protected.GET("/artworks/:id/download", marketplaceHandler.DownloadArtwork)
	protected.GET("/me/purchases", marketplaceHandler.GetMyPurchases)
	protected.GET("/me/sales", marketplaceHandler.GetMySales)
	protected.GET("/me/licenses", marketplaceHandler.GetMyLicenses)
	protected.GET("/me/bookmarks", userHandler.GetMyBookmarks)
	protected.GET("/me/recently-viewed", userHandler.GetMyRecentlyViewed)
	protected.GET("/me/saved-searches", userHandler.GetMySavedSearches)
	protected.POST("/me/saved-searches", userHandler.CreateSavedSearch)
	protected.DELETE("/me/saved-searches/:id", userHandler.DeleteSavedSearch)

	// Users
	protected.GET("/users/me", userHandler.GetMe)
	protected.PUT("/users/me", userHandler.UpdateProfile)
	protected.DELETE("/users/me", userHandler.DeleteAccount)
	protected.POST("/users/:id/follow", userHandler.FollowUser)
	protected.DELETE("/users/:id/follow", userHandler.UnfollowUser)
	protected.GET("/me/following", userHandler.GetFollowing)
	protected.GET("/me/followers", userHandler.GetFollowers)
	protected.GET("/me/notifications", userHandler.GetNotifications)
	protected.POST("/me/notifications/:id/read", userHandler.MarkNotificationAsRead)
	protected.POST("/me/notifications/read-all", userHandler.MarkAllNotificationsAsRead)
	protected.GET("/me/notification-prefs", userHandler.GetNotificationPrefs)
	protected.PUT("/me/notification-prefs", userHandler.UpdateNotificationPrefs)
	protected.GET("/me/dashboard", userHandler.GetDashboardStats)
	protected.GET("/me/analytics", userHandler.GetAnalytics)
	protected.GET("/me/analytics/export", userHandler.ExportAnalytics)
	protected.GET("/me/messages/conversations", messageHandler.GetConversations)
	protected.GET("/me/messages/:userId", messageHandler.GetConversationMessages)
	protected.POST("/me/messages", messageHandler.SendMessage)

	protected.POST("/reports", reportHandler.CreateReport)

	protected.POST("/presets", presetHandler.CreatePreset)
	protected.DELETE("/presets/:id", presetHandler.DeletePreset)

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
