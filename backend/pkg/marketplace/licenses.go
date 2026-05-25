package marketplace

import "strings"

var DefaultLicenses = []string{"standard", "personal", "commercial", "exclusive"}

var Terms = map[string]string{
	"standard":   "Non-exclusive license for personal and small commercial projects. No resale of the artwork file.",
	"personal":   "Personal use only — wallpapers, prints for yourself, social posts. No commercial use.",
	"commercial": "Commercial use in client work, marketing, and products. No exclusive rights; artist may sell to others.",
	"exclusive":  "Exclusive rights — artwork is delisted after purchase. Buyer has sole commercial rights.",
}

func NormalizeLicense(license string) string {
	return strings.ToLower(strings.TrimSpace(license))
}

func IsValidLicense(license string) bool {
	switch NormalizeLicense(license) {
	case "standard", "personal", "commercial", "exclusive":
		return true
	default:
		return false
	}
}

func AllowedLicenses(artworkLicensing []string) []string {
	if len(artworkLicensing) == 0 {
		return []string{"standard"}
	}
	out := make([]string, 0, len(artworkLicensing))
	for _, l := range artworkLicensing {
		if IsValidLicense(l) {
			out = append(out, NormalizeLicense(l))
		}
	}
	if len(out) == 0 {
		return []string{"standard"}
	}
	return out
}

func LicenseAllowed(requested string, artworkLicensing []string) bool {
	req := NormalizeLicense(requested)
	for _, allowed := range AllowedLicenses(artworkLicensing) {
		if req == allowed {
			return true
		}
	}
	return false
}

func TermsFor(license string) string {
	if t, ok := Terms[NormalizeLicense(license)]; ok {
		return t
	}
	return Terms["standard"]
}

func IsExclusiveLicense(license string) bool {
	return NormalizeLicense(license) == "exclusive"
}
