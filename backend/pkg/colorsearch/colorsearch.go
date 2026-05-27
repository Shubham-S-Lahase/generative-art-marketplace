package colorsearch

import (
	"math"
	"strings"
)

const bucketDegrees = 30.0

// ParseHex returns RGB components 0–255. Supports #RGB and #RRGGBB.
func ParseHex(hex string) (r, g, b int, ok bool) {
	s := strings.TrimSpace(strings.TrimPrefix(strings.ToLower(hex), "#"))
	switch len(s) {
	case 3:
		r = hexNibble(s[0]) * 17
		g = hexNibble(s[1]) * 17
		b = hexNibble(s[2]) * 17
	case 6:
		r = hexNibble(s[0])*16 + hexNibble(s[1])
		g = hexNibble(s[2])*16 + hexNibble(s[3])
		b = hexNibble(s[4])*16 + hexNibble(s[5])
	default:
		return 0, 0, 0, false
	}
	return r, g, b, true
}

func hexNibble(c byte) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c - 'a' + 10)
	default:
		return 0
	}
}

// HueDegrees returns hue in [0, 360) for the given hex color.
func HueDegrees(hex string) (float64, bool) {
	r, g, b, ok := ParseHex(hex)
	if !ok {
		return 0, false
	}
	rf, gf, bf := float64(r)/255, float64(g)/255, float64(b)/255
	max := math.Max(rf, math.Max(gf, bf))
	min := math.Min(rf, math.Min(gf, bf))
	delta := max - min
	if delta < 1e-6 {
		return 0, true
	}
	var hue float64
	switch max {
	case rf:
		hue = 60 * math.Mod((gf-bf)/delta, 6)
	case gf:
		hue = 60 * (((bf - rf) / delta) + 2)
	default:
		hue = 60 * (((rf - gf) / delta) + 4)
	}
	if hue < 0 {
		hue += 360
	}
	return hue, true
}

// BucketIndex maps a hue to a 12-bucket index (30° per bucket).
func BucketIndex(hue float64) int {
	idx := int(hue / bucketDegrees)
	if idx >= 12 {
		idx = 11
	}
	if idx < 0 {
		idx = 0
	}
	return idx
}

// BucketsFromHexColors returns unique bucket indices for a palette.
func BucketsFromHexColors(colors []string) []int {
	seen := make(map[int]struct{})
	out := make([]int, 0, len(colors))
	for _, c := range colors {
		h, ok := HueDegrees(c)
		if !ok {
			continue
		}
		b := BucketIndex(h)
		if _, exists := seen[b]; exists {
			continue
		}
		seen[b] = struct{}{}
		out = append(out, b)
	}
	return out
}

// NeighborBuckets returns bucket indices within toleranceDegrees of centerHue.
func NeighborBuckets(centerHue float64, toleranceDegrees float64) []int {
	if toleranceDegrees < 1 {
		toleranceDegrees = 30
	}
	span := int(math.Ceil(toleranceDegrees / bucketDegrees))
	if span < 1 {
		span = 1
	}
	center := BucketIndex(centerHue)
	seen := make(map[int]struct{})
	out := make([]int, 0, span*2+1)
	for d := -span; d <= span; d++ {
		b := (center + d + 12) % 12
		if _, ok := seen[b]; ok {
			continue
		}
		seen[b] = struct{}{}
		out = append(out, b)
	}
	return out
}

// HueDistance returns the smallest angular distance between two hues (0–180).
func HueDistance(a, b float64) float64 {
	d := math.Abs(a - b)
	if d > 180 {
		d = 360 - d
	}
	return d
}

// MatchesPalette returns true if queryHex is within toleranceDegrees of any palette color.
func MatchesPalette(queryHex string, palette []string, toleranceDegrees float64) bool {
	if toleranceDegrees < 1 {
		toleranceDegrees = 30
	}
	qHue, ok := HueDegrees(queryHex)
	if !ok {
		return false
	}
	for _, c := range palette {
		pHue, ok := HueDegrees(c)
		if !ok {
			continue
		}
		if HueDistance(qHue, pHue) <= toleranceDegrees {
			return true
		}
	}
	return false
}
