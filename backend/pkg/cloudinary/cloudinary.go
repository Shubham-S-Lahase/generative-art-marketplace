package cloudinary

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

const PreviewFolder = "artworks/previews"

type Service struct {
	cld *cloudinary.Cloudinary
}

// UploadResult holds Cloudinary asset identifiers returned after upload.
type UploadResult struct {
	URL      string
	PublicID string
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

// UploadImage uploads an image to Cloudinary and returns URL + public ID.
func (s *Service) UploadImage(ctx context.Context, imageData []byte, folder string) (UploadResult, error) {
	filename := fmt.Sprintf("art_%d", time.Now().UnixNano())
	result, err := s.cld.Upload.Upload(ctx, bytes.NewReader(imageData), uploader.UploadParams{
		PublicID:     filename,
		Folder:       folder,
		ResourceType: "image",
		Format:       "png",
	})
	if err != nil {
		return UploadResult{}, fmt.Errorf("failed to upload to Cloudinary: %w", err)
	}
	return UploadResult{
		URL:      result.SecureURL,
		PublicID: fullPublicID(folder, result.PublicID),
	}, nil
}

// UploadImageFromReader uploads an image from an io.Reader
func (s *Service) UploadImageFromReader(ctx context.Context, reader io.Reader, folder string) (UploadResult, error) {
	filename := fmt.Sprintf("art_%d", time.Now().UnixNano())
	result, err := s.cld.Upload.Upload(ctx, reader, uploader.UploadParams{
		PublicID:     filename,
		Folder:       folder,
		ResourceType: "image",
		Format:       "png",
	})
	if err != nil {
		return UploadResult{}, fmt.Errorf("failed to upload to Cloudinary: %w", err)
	}
	return UploadResult{
		URL:      result.SecureURL,
		PublicID: fullPublicID(folder, result.PublicID),
	}, nil
}

func fullPublicID(folder, publicID string) string {
	publicID = strings.TrimPrefix(publicID, "/")
	folder = strings.Trim(folder, "/")
	if folder == "" {
		return publicID
	}
	if strings.HasPrefix(publicID, folder+"/") {
		return publicID
	}
	return folder + "/" + publicID
}

// DeleteByPublicID removes an image from Cloudinary. Only preview assets may be deleted.
func (s *Service) DeleteByPublicID(ctx context.Context, publicID string) error {
	publicID = strings.TrimSpace(strings.TrimPrefix(publicID, "/"))
	if publicID == "" {
		return fmt.Errorf("publicId is required")
	}
	if !strings.HasPrefix(publicID, PreviewFolder+"/") {
		return fmt.Errorf("only preview assets can be deleted")
	}
	_, err := s.cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     publicID,
		ResourceType: "image",
	})
	if err != nil {
		return fmt.Errorf("failed to delete from Cloudinary: %w", err)
	}
	return nil
}

// PublicIDFromURL extracts the Cloudinary public_id from a secure URL when possible.
func PublicIDFromURL(imageURL string) string {
	const marker = "/upload/"
	idx := strings.Index(imageURL, marker)
	if idx < 0 {
		return ""
	}
	rest := imageURL[idx+len(marker):]
	// Strip version prefix v1234567890/
	if strings.HasPrefix(rest, "v") {
		if slash := strings.Index(rest, "/"); slash > 0 {
			rest = rest[slash+1:]
		}
	}
	// Remove file extension
	if dot := strings.LastIndex(rest, "."); dot > 0 {
		rest = rest[:dot]
	}
	return rest
}
