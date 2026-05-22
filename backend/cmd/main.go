package main

import (
	"context"
	"log"

	"generative-art-marketplace/internal/api/middleware"
	"generative-art-marketplace/internal/api/routes"
	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/websocket"
	"generative-art-marketplace/pkg/cloudinary"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (ignore error if file doesn't exist)
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	cfg := config.Load()
	
	// Initialize Cloudinary (required)
	var cloudinaryService *cloudinary.Service
		var cld *cloudinary.Service
		var err error
		
		// Prefer CLOUDINARY_URL if provided (standard Cloudinary format)
		if cfg.CloudinaryURL != "" {
			cld, err = cloudinary.NewServiceFromURL(cfg.CloudinaryURL)
			if err != nil {
				log.Fatalf("failed to initialize Cloudinary from URL: %v", err)
			}
			log.Println("Cloudinary initialized from CLOUDINARY_URL")
		} else if cfg.CloudinaryCloudName != "" && cfg.CloudinaryAPIKey != "" && cfg.CloudinaryAPISecret != "" {
			// Fallback to individual credentials
			cld, err = cloudinary.NewService(cfg.CloudinaryCloudName, cfg.CloudinaryAPIKey, cfg.CloudinaryAPISecret)
			if err != nil {
				log.Fatalf("failed to initialize Cloudinary: %v", err)
			}
			log.Println("Cloudinary initialized from individual credentials")
		} else {
		log.Fatal("Cloudinary credentials are missing. Please set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET")
		}
		
		cloudinaryService = cld
		log.Println("Cloudinary initialized successfully")

	gin.SetMode(cfg.GinMode)
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	db, err := database.Connect(cfg.MongoURI, cfg.MongoDatabase)
	if err != nil {
		log.Fatalf("failed to connect to mongo: %v", err)
	}
	defer db.Close(context.Background())

	wsHub := websocket.NewHub()
	go wsHub.Run()

	routes.Register(r, db, wsHub, cfg, cloudinaryService)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

