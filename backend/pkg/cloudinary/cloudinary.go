package cloudinary

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

type Service struct {
	cld *cloudinary.Cloudinary
}

// NewService creates a new Cloudinary service instance
func NewService(cloudName, apiKey, apiSecret string) (*Service, error) {
	cld, err := cloudinary.NewFromParams(cloudName, apiKey, apiSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Cloudinary: %w", err)
	}
	return &Service{cld: cld}, nil
}

// NewServiceFromURL creates a Cloudinary service from CLOUDINARY_URL environment variable
// Format: cloudinary://api_key:api_secret@cloud_name
func NewServiceFromURL(cloudinaryURL string) (*Service, error) {
	cld, err := cloudinary.NewFromURL(cloudinaryURL)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Cloudinary from URL: %w", err)
	}
	return &Service{cld: cld}, nil
}

// UploadImage uploads an image to Cloudinary and returns the public URL
func (s *Service) UploadImage(ctx context.Context, imageData []byte, folder string) (string, error) {
	// Generate unique filename
	filename := fmt.Sprintf("art_%d", time.Now().UnixNano())
	
	// Upload to Cloudinary
	result, err := s.cld.Upload.Upload(ctx, bytes.NewReader(imageData), uploader.UploadParams{
		PublicID:     filename,
		Folder:       folder,
		ResourceType: "image",
		Format:       "png",
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to Cloudinary: %w", err)
	}

	return result.SecureURL, nil
}

// UploadImageFromReader uploads an image from an io.Reader
func (s *Service) UploadImageFromReader(ctx context.Context, reader io.Reader, folder string) (string, error) {
	filename := fmt.Sprintf("art_%d", time.Now().UnixNano())
	
	result, err := s.cld.Upload.Upload(ctx, reader, uploader.UploadParams{
		PublicID:     filename,
		Folder:       folder,
		ResourceType: "image",
		Format:       "png",
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to Cloudinary: %w", err)
	}

	return result.SecureURL, nil
}

// DeleteImage deletes an image from Cloudinary by URL
func (s *Service) DeleteImage(ctx context.Context, imageURL string) error {
	// Extract public ID from URL
	// Cloudinary URLs format: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{public_id}.{format}
	// For now, we'll need to parse the URL or store public_id separately
	// This is a simplified version - you might want to store public_id in DB
	return nil // Implement if needed
}

