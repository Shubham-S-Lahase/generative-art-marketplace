package generator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGeneratePNG(t *testing.T) {
	dir := t.TempDir()
	params := Params{
		Colors:     []string{"#ff0000", "#00ff00"},
		Pattern:    "spiral",
		Complexity: 3,
		Seed:       42,
		Width:      200,
		Height:     200,
	}

	path, err := GeneratePNG(params, dir)
	if err != nil {
		t.Fatalf("GeneratePNG error: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected file to exist at %s", path)
	}
	if filepath.Dir(path) != dir {
		t.Fatalf("expected file in temp dir")
	}
}

