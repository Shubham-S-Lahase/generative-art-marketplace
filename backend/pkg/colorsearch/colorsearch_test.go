package colorsearch

import "testing"

func TestHueDegrees(t *testing.T) {
	h, ok := HueDegrees("#ff0000")
	if !ok || h < 0 || h >= 360 {
		t.Fatalf("red hue: ok=%v h=%v", ok, h)
	}
}

func TestMatchesPalette(t *testing.T) {
	palette := []string{"#FF6B6B", "#4ECDC4"}
	if !MatchesPalette("#ff7070", palette, 25) {
		t.Fatal("expected close red to match")
	}
	if MatchesPalette("#0000ff", palette, 10) {
		t.Fatal("blue should not match warm palette with low tolerance")
	}
}

func TestNeighborBuckets(t *testing.T) {
	buckets := NeighborBuckets(15, 30)
	if len(buckets) < 2 {
		t.Fatalf("expected multiple buckets, got %v", buckets)
	}
}
