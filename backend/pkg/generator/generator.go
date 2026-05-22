package generator

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"time"
)

// Params defines the input for generating art.
type Params struct {
	Colors     []string
	Pattern    string
	Complexity int
	Seed       int64
	Width      int
	Height     int
}

// GeneratePNG creates a deterministic PNG and saves it to disk, returning the file path.
func GeneratePNG(params Params, uploadsDir string) (string, error) {
	if params.Width == 0 {
		params.Width = 800
	}
	if params.Height == 0 {
		params.Height = 600
	}
	if params.Seed == 0 {
		params.Seed = time.Now().UnixNano()
	}
	if params.Complexity == 0 {
		params.Complexity = 5
	}

	rnd := rand.New(rand.NewSource(params.Seed))
	img := image.NewRGBA(image.Rect(0, 0, params.Width, params.Height))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	switch params.Pattern {
	case "spiral":
		drawSpiral(img, rnd, params)
	case "geometric":
		drawGeometric(img, rnd, params)
	case "organic":
		drawOrganic(img, rnd, params)
	default:
		drawRandom(img, rnd, params)
	}

	buf := &bytes.Buffer{}
	if err := png.Encode(buf, img); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("art_%d.png", time.Now().UnixNano())
	fullPath := filepath.Join(uploadsDir, filename)
	if err := os.WriteFile(fullPath, buf.Bytes(), 0o644); err != nil {
		return "", err
	}
	return fullPath, nil
}

// DecodeBase64PNG saves a base64 PNG into uploads dir and returns path.
func DecodeBase64PNG(data string, uploadsDir string) (string, error) {
	if data == "" {
		return "", fmt.Errorf("empty image data")
	}
	// strip prefix if data URL
	if len(data) > 22 && data[:22] == "data:image/png;base64," {
		data = data[22:]
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", err
	}
	filename := fmt.Sprintf("upload_%d.png", time.Now().UnixNano())
	fullPath := filepath.Join(uploadsDir, filename)
	if err := os.WriteFile(fullPath, decoded, 0o644); err != nil {
		return "", err
	}
	return fullPath, nil
}

// DecodeBase64ToBytes decodes base64 PNG data and returns the bytes (for Cloudinary upload)
func DecodeBase64ToBytes(data string) ([]byte, error) {
	if data == "" {
		return nil, fmt.Errorf("empty image data")
	}
	// strip prefix if data URL
	if len(data) > 22 && data[:22] == "data:image/png;base64," {
		data = data[22:]
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

// GeneratePNGBytes creates a PNG image and returns the bytes (for Cloudinary upload)
func GeneratePNGBytes(params Params) ([]byte, error) {
	if params.Width == 0 {
		params.Width = 800
	}
	if params.Height == 0 {
		params.Height = 600
	}
	if params.Seed == 0 {
		params.Seed = time.Now().UnixNano()
	}
	if params.Complexity == 0 {
		params.Complexity = 5
	}

	rnd := rand.New(rand.NewSource(params.Seed))
	img := image.NewRGBA(image.Rect(0, 0, params.Width, params.Height))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	switch params.Pattern {
	case "spiral":
		drawSpiral(img, rnd, params)
	case "geometric":
		drawGeometric(img, rnd, params)
	case "organic":
		drawOrganic(img, rnd, params)
	default:
		drawRandom(img, rnd, params)
	}

	buf := &bytes.Buffer{}
	if err := png.Encode(buf, img); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func drawSpiral(img *image.RGBA, rnd *rand.Rand, params Params) {
	centerX := float64(img.Bounds().Dx()) / 2
	centerY := float64(img.Bounds().Dy()) / 2
	maxRadius := math.Min(centerX, centerY) * 0.8

	for i := 0; i < params.Complexity*80; i++ {
		angle := float64(i) * 0.15
		radius := maxRadius * float64(i) / float64(params.Complexity*80)
		x := centerX + radius*math.Cos(angle)
		y := centerY + radius*math.Sin(angle)
		col := pickColor(params.Colors, rnd)
		setCircle(img, int(x), int(y), 3, col)
	}
}

func drawGeometric(img *image.RGBA, rnd *rand.Rand, params Params) {
	size := 20
	for x := 0; x < img.Bounds().Dx(); x += size {
		for y := 0; y < img.Bounds().Dy(); y += size {
			if rnd.Float64() < 0.65 {
				col := pickColor(params.Colors, rnd)
				drawRect(img, x, y, size-2, size-2, col)
			}
		}
	}
}

func drawOrganic(img *image.RGBA, rnd *rand.Rand, params Params) {
	for i := 0; i < params.Complexity*12; i++ {
		startX := rnd.Intn(img.Bounds().Dx())
		startY := rnd.Intn(img.Bounds().Dy())
		col := pickColor(params.Colors, rnd)
		for j := 0; j < 16; j++ {
			nextX := startX + rnd.Intn(41) - 20
			nextY := startY + rnd.Intn(41) - 20
			drawLine(img, startX, startY, nextX, nextY, col)
			startX, startY = nextX, nextY
		}
	}
}

func drawRandom(img *image.RGBA, rnd *rand.Rand, params Params) {
	for i := 0; i < params.Complexity*50; i++ {
		x := rnd.Intn(img.Bounds().Dx())
		y := rnd.Intn(img.Bounds().Dy())
		col := pickColor(params.Colors, rnd)
		setCircle(img, x, y, rnd.Intn(8)+2, col)
	}
}

func drawRect(img *image.RGBA, x, y, w, h int, c color.Color) {
	for i := x; i < x+w; i++ {
		for j := y; j < y+h; j++ {
			if image.Pt(i, j).In(img.Bounds()) {
				img.Set(i, j, c)
			}
		}
	}
}

func setCircle(img *image.RGBA, cx, cy, r int, c color.Color) {
	for x := -r; x <= r; x++ {
		for y := -r; y <= r; y++ {
			if x*x+y*y <= r*r {
				px := cx + x
				py := cy + y
				if image.Pt(px, py).In(img.Bounds()) {
					img.Set(px, py, c)
				}
			}
		}
	}
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.Color) {
	dx := int(math.Abs(float64(x1 - x0)))
	dy := -int(math.Abs(float64(y1 - y0)))
	sx := -1
	if x0 < x1 {
		sx = 1
	}
	sy := -1
	if y0 < y1 {
		sy = 1
	}
	err := dx + dy
	for {
		if image.Pt(x0, y0).In(img.Bounds()) {
			img.Set(x0, y0, c)
		}
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}

func pickColor(hexColors []string, rnd *rand.Rand) color.Color {
	if len(hexColors) == 0 {
		return color.Black
	}
	hex := hexColors[rnd.Intn(len(hexColors))]
	return parseHexColor(hex)
}

func parseHexColor(s string) color.Color {
	if len(s) == 7 && s[0] == '#' {
		var r, g, b uint8
		fmt.Sscanf(s, "#%02x%02x%02x", &r, &g, &b)
		return color.RGBA{R: r, G: g, B: b, A: 255}
	}
	return color.Black
}

