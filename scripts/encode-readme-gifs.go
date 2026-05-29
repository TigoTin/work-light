//go:build ignore

package main

import (
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/png"
	"log"
	"os"
	"path/filepath"
	"sort"
)

var names = []string{"idle", "working", "waiting", "error", "multisession"}

func main() {
	if len(os.Args) != 3 {
		log.Fatalf("usage: go run scripts/encode-readme-gifs.go <frames-dir> <output-dir>")
	}
	framesRoot := os.Args[1]
	outputDir := os.Args[2]
	must(os.MkdirAll(outputDir, 0o755))

	for _, name := range names {
		frames := readFrames(filepath.Join(framesRoot, name))
		writeGIF(filepath.Join(outputDir, "work-light-"+name+".gif"), frames)
	}
}

func readFrames(dir string) []image.Image {
	matches, err := filepath.Glob(filepath.Join(dir, "*.png"))
	must(err)
	sort.Strings(matches)
	if len(matches) == 0 {
		log.Fatalf("no png frames found in %s", dir)
	}

	frames := make([]image.Image, 0, len(matches))
	for _, path := range matches {
		file, err := os.Open(path)
		must(err)
		img, err := png.Decode(file)
		_ = file.Close()
		must(err)
		frames = append(frames, img)
	}
	return frames
}

func writeGIF(path string, frames []image.Image) {
	pal := buildPalette(frames)
	anim := &gif.GIF{LoopCount: 0}

	for _, frame := range frames {
		paletted := image.NewPaletted(frame.Bounds(), pal)
		draw.Draw(paletted, frame.Bounds(), frame, frame.Bounds().Min, draw.Src)
		anim.Image = append(anim.Image, paletted)
		anim.Delay = append(anim.Delay, 12)
	}

	out, err := os.Create(path)
	must(err)
	defer out.Close()
	must(gif.EncodeAll(out, anim))
	log.Printf("wrote %s (%d frames)", path, len(frames))
}

func buildPalette(frames []image.Image) color.Palette {
	type bucket struct {
		r, g, b uint8
		count   int
	}
	counts := map[uint32]int{}
	for _, frame := range frames {
		bounds := frame.Bounds()
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				r16, g16, b16, a16 := frame.At(x, y).RGBA()
				if a16 == 0 {
					continue
				}
				r := uint8(r16 >> 8)
				g := uint8(g16 >> 8)
				b := uint8(b16 >> 8)
				key := uint32(r>>3)<<10 | uint32(g>>3)<<5 | uint32(b>>3)
				counts[key]++
			}
		}
	}

	buckets := make([]bucket, 0, len(counts))
	for key, count := range counts {
		r := uint8(((key >> 10) & 31) << 3)
		g := uint8(((key >> 5) & 31) << 3)
		b := uint8((key & 31) << 3)
		buckets = append(buckets, bucket{r: r + 4, g: g + 4, b: b + 4, count: count})
	}
	sort.Slice(buckets, func(i, j int) bool {
		return buckets[i].count > buckets[j].count
	})

	palette := color.Palette{
		color.RGBA{0, 0, 0, 255},
		color.RGBA{255, 255, 255, 255},
	}
	limit := min(256, len(buckets)+len(palette))
	for _, bucket := range buckets {
		if len(palette) >= limit {
			break
		}
		palette = append(palette, color.RGBA{bucket.r, bucket.g, bucket.b, 255})
	}
	return palette
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
