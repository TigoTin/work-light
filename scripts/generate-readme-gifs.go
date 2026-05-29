//go:build ignore

package main

import (
	"image"
	"image/color"
	"image/color/palette"
	"image/draw"
	"image/gif"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
)

const (
	width  = 360
	height = 116
	scale  = 3
)

var font = map[rune][]string{
	' ': {"00000", "00000", "00000", "00000", "00000", "00000", "00000"},
	'+': {"00000", "00100", "00100", "11111", "00100", "00100", "00000"},
	'-': {"00000", "00000", "00000", "11111", "00000", "00000", "00000"},
	'0': {"01110", "10001", "10011", "10101", "11001", "10001", "01110"},
	'1': {"00100", "01100", "00100", "00100", "00100", "00100", "01110"},
	'A': {"01110", "10001", "10001", "11111", "10001", "10001", "10001"},
	'C': {"01111", "10000", "10000", "10000", "10000", "10000", "01111"},
	'D': {"11110", "10001", "10001", "10001", "10001", "10001", "11110"},
	'E': {"11111", "10000", "10000", "11110", "10000", "10000", "11111"},
	'G': {"01111", "10000", "10000", "10111", "10001", "10001", "01111"},
	'H': {"10001", "10001", "10001", "11111", "10001", "10001", "10001"},
	'I': {"11111", "00100", "00100", "00100", "00100", "00100", "11111"},
	'K': {"10001", "10010", "10100", "11000", "10100", "10010", "10001"},
	'L': {"10000", "10000", "10000", "10000", "10000", "10000", "11111"},
	'M': {"10001", "11011", "10101", "10101", "10001", "10001", "10001"},
	'O': {"01110", "10001", "10001", "10001", "10001", "10001", "01110"},
	'R': {"11110", "10001", "10001", "11110", "10100", "10010", "10001"},
	'S': {"01111", "10000", "10000", "01110", "00001", "00001", "11110"},
	'T': {"11111", "00100", "00100", "00100", "00100", "00100", "00100"},
	'W': {"10001", "10001", "10001", "10101", "10101", "10101", "01010"},
	'X': {"10001", "01010", "00100", "00100", "00100", "01010", "10001"},
}

type statusFrame struct {
	status      string
	label       string
	workspace   string
	otherBadge  bool
	badgeBright bool
	lampStep    int
	pulseStep   int
	jolt        int
}

func main() {
	out := filepath.Join("docs", "assets", "screenshots")
	must(os.MkdirAll(out, 0o755))

	writeGIF(filepath.Join(out, "work-light-idle.gif"), []statusFrame{
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", pulseStep: 0},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", pulseStep: 1},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", pulseStep: 2},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", pulseStep: 1},
	})
	writeGIF(filepath.Join(out, "work-light-working.gif"), []statusFrame{
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 0, pulseStep: 0},
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 1, pulseStep: 1},
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 2, pulseStep: 2},
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 0, pulseStep: 3},
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 1, pulseStep: 1},
		{status: "working", label: "WORK", workspace: "WORK-LIGHT", lampStep: 2, pulseStep: 0},
	})
	writeGIF(filepath.Join(out, "work-light-waiting.gif"), []statusFrame{
		{status: "waiting", label: "WAIT", workspace: "WORK-LIGHT", pulseStep: 0},
		{status: "waiting", label: "WAIT", workspace: "WORK-LIGHT", pulseStep: 1},
		{status: "waiting", label: "WAIT", workspace: "WORK-LIGHT", pulseStep: 0},
		{status: "waiting", label: "WAIT", workspace: "WORK-LIGHT", pulseStep: 1},
	})
	writeGIF(filepath.Join(out, "work-light-error.gif"), []statusFrame{
		{status: "error", label: "ERR", workspace: "WORK-LIGHT", jolt: -2},
		{status: "error", label: "ERR", workspace: "WORK-LIGHT", jolt: 2},
		{status: "error", label: "ERR", workspace: "WORK-LIGHT", jolt: -1},
		{status: "error", label: "ERR", workspace: "WORK-LIGHT"},
		{status: "error", label: "ERR", workspace: "WORK-LIGHT"},
	})
	writeGIF(filepath.Join(out, "work-light-multisession.gif"), []statusFrame{
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", otherBadge: true, badgeBright: true, pulseStep: 0},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", otherBadge: true, pulseStep: 1},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", otherBadge: true, badgeBright: true, pulseStep: 2},
		{status: "idle", label: "IDLE", workspace: "WORK-LIGHT", otherBadge: true, pulseStep: 1},
	})
}

func writeGIF(path string, frames []statusFrame) {
	anim := &gif.GIF{LoopCount: 0}
	pal := append(color.Palette{rgba(0, 0, 0, 0)}, palette.WebSafe...)
	for _, frame := range frames {
		img := render(frame)
		pimg := image.NewPaletted(img.Bounds(), pal)
		draw.FloydSteinberg.Draw(pimg, img.Bounds(), img, image.Point{})
		anim.Image = append(anim.Image, pimg)
		anim.Delay = append(anim.Delay, 18)
	}
	file, err := os.Create(path)
	must(err)
	defer file.Close()
	must(gif.EncodeAll(file, anim))
	log.Printf("wrote %s", path)
}

func render(frame statusFrame) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	panel, edge := colorsFor(frame.status)
	offset := frame.jolt

	fillRounded(img, 0+offset, 0, width, height, 12, rgba(7, 12, 13, 255))
	fillRounded(img, 6+offset, 6, width-12, height-12, 8, panel)
	strokeRect(img, 12+offset, 14, width-24, height-28, edge, 3)
	drawScanlines(img, 15+offset, 17, width-30, height-34)
	drawDashes(img, 17+offset, 19, width-34, height-38, rgba(255, 231, 117, 140))

	text(img, 25+offset, 26, "CODEX", rgba(255, 244, 172, 255), 2)
	headerX := 92 + offset
	if frame.otherBadge {
		bc := rgba(255, 211, 74, 210)
		if frame.badgeBright {
			bc = rgba(255, 236, 112, 255)
		}
		fillRect(img, 84+offset, 21, 40, 22, rgba(10, 15, 15, 255))
		fillRect(img, 88+offset, 24, 32, 16, bc)
		text(img, 92+offset, 27, "+1", rgba(12, 18, 18, 255), 1)
		headerX = 132 + offset
	}
	fillRect(img, headerX-6, 21, 142, 22, rgba(17, 27, 27, 160))
	fillRect(img, headerX-6, 21, 3, 22, rgba(255, 227, 110, 180))
	text(img, headerX+2, 26, frame.workspace, rgba(255, 244, 172, 255), 2)
	fillRect(img, width-42+offset, 24, 20, 20, rgba(5, 10, 10, 255))
	fillRect(img, width-35+offset, 29, 8, 8, rgba(82, 242, 125, 255))

	drawLampPanel(img, 31+offset, 48, frame)
	drawPulse(img, 185+offset, 54, frame)
	drawStatusLabel(img, 238+offset, 48, frame.label)
	return img
}

func colorsFor(status string) (color.RGBA, color.RGBA) {
	switch status {
	case "working":
		return rgba(64, 51, 32, 255), rgba(255, 211, 74, 255)
	case "waiting":
		return rgba(63, 56, 33, 255), rgba(255, 211, 74, 255)
	case "error":
		return rgba(69, 32, 35, 255), rgba(251, 59, 54, 255)
	default:
		return rgba(32, 61, 49, 255), rgba(103, 236, 134, 255)
	}
}

func drawLampPanel(img *image.RGBA, x, y int, frame statusFrame) {
	fillRounded(img, x, y, 126, 48, 7, rgba(16, 25, 25, 255))
	strokeRect(img, x+4, y+4, 118, 40, rgba(6, 10, 10, 255), 4)
	active := [3]bool{}
	switch frame.status {
	case "working":
		active[frame.lampStep%3] = true
	case "waiting":
		active[1] = true
	case "error":
		active[0] = true
	default:
		active[2] = true
	}
	cols := []color.RGBA{rgba(251, 59, 54, 255), rgba(255, 211, 74, 255), rgba(82, 242, 125, 255)}
	for i := range cols {
		drawLamp(img, x+24+i*38, y+24, cols[i], active[i])
	}
}

func drawLamp(img *image.RGBA, cx, cy int, c color.RGBA, active bool) {
	if active {
		fillCircle(img, cx, cy, 19, rgba(c.R, c.G, c.B, 54))
	}
	fillCircle(img, cx, cy, 16, rgba(4, 8, 8, 255))
	base := rgba(43, 55, 50, 255)
	if active {
		base = c
	}
	fillCircle(img, cx, cy, 11, base)
	if active {
		fillRect(img, cx-5, cy-7, 6, 4, rgba(255, 255, 255, 220))
	}
}

func drawPulse(img *image.RGBA, x, y int, frame statusFrame) {
	switch frame.status {
	case "working":
		heights := [][]int{{8, 20, 13}, {19, 9, 22}, {11, 22, 9}, {22, 14, 18}}
		for i, h := range heights[frame.pulseStep%len(heights)] {
			fillRect(img, x+i*10, y+24-h, 7, h, rgba(255, 211, 74, 255))
		}
	case "waiting":
		c := rgba(255, 211, 74, 255)
		if frame.pulseStep%2 == 1 {
			c = rgba(255, 211, 74, 120)
		}
		fillRect(img, x, y+12, 26, 7, c)
	case "error":
		drawLine(img, x, y+6, x+28, y+34, rgba(251, 59, 54, 255), 5)
		drawLine(img, x+28, y+6, x, y+34, rgba(251, 59, 54, 255), 5)
	default:
		w := 20 + (frame.pulseStep%3)*4
		fillRect(img, x, y+16, w, 6, rgba(82, 242, 125, 255))
	}
}

func drawStatusLabel(img *image.RGBA, x, y int, label string) {
	fillRounded(img, x, y, 94, 48, 7, rgba(12, 16, 16, 255))
	fillRounded(img, x+5, y+5, 84, 38, 5, rgba(255, 240, 164, 255))
	text(img, x+20, y+17, label, rgba(16, 25, 25, 255), 3)
}

func text(img *image.RGBA, x, y int, s string, c color.RGBA, size int) {
	cursor := x
	for _, r := range strings.ToUpper(s) {
		glyph, ok := font[r]
		if !ok {
			cursor += 6 * size
			continue
		}
		for row, bits := range glyph {
			for col, bit := range bits {
				if bit == '1' {
					fillRect(img, cursor+col*size, y+row*size, size, size, c)
				}
			}
		}
		cursor += 6 * size
	}
}

func drawScanlines(img *image.RGBA, x, y, w, h int) {
	for yy := y; yy < y+h; yy += 6 {
		fillRect(img, x, yy, w, 3, rgba(255, 255, 255, 18))
	}
}

func drawDashes(img *image.RGBA, x, y, w, h int, c color.RGBA) {
	for xx := x; xx < x+w; xx += 14 {
		fillRect(img, xx, y, 8, 3, c)
		fillRect(img, xx, y+h-3, 8, 3, c)
	}
	for yy := y; yy < y+h; yy += 14 {
		fillRect(img, x, yy, 3, 8, c)
		fillRect(img, x+w-3, yy, 3, 8, c)
	}
}

func fillRounded(img *image.RGBA, x, y, w, h, r int, c color.RGBA) {
	fillRect(img, x+r, y, w-2*r, h, c)
	fillRect(img, x, y+r, w, h-2*r, c)
	fillCircle(img, x+r, y+r, r, c)
	fillCircle(img, x+w-r-1, y+r, r, c)
	fillCircle(img, x+r, y+h-r-1, r, c)
	fillCircle(img, x+w-r-1, y+h-r-1, r, c)
}

func strokeRect(img *image.RGBA, x, y, w, h int, c color.RGBA, t int) {
	fillRect(img, x, y, w, t, c)
	fillRect(img, x, y+h-t, w, t, c)
	fillRect(img, x, y, t, h, c)
	fillRect(img, x+w-t, y, t, h, c)
}

func fillRect(img *image.RGBA, x, y, w, h int, c color.RGBA) {
	for yy := max(0, y); yy < min(height, y+h); yy++ {
		for xx := max(0, x); xx < min(width, x+w); xx++ {
			img.SetRGBA(xx, yy, blend(img.RGBAAt(xx, yy), c))
		}
	}
}

func fillCircle(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	rr := r * r
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			if (x-cx)*(x-cx)+(y-cy)*(y-cy) <= rr {
				if x >= 0 && x < width && y >= 0 && y < height {
					img.SetRGBA(x, y, blend(img.RGBAAt(x, y), c))
				}
			}
		}
	}
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA, t int) {
	dx := float64(x1 - x0)
	dy := float64(y1 - y0)
	steps := int(math.Max(math.Abs(dx), math.Abs(dy)))
	for i := 0; i <= steps; i++ {
		x := x0 + int(dx*float64(i)/float64(steps))
		y := y0 + int(dy*float64(i)/float64(steps))
		fillRect(img, x-t/2, y-t/2, t, t, c)
	}
}

func blend(dst, src color.RGBA) color.RGBA {
	if src.A == 255 {
		return src
	}
	a := float64(src.A) / 255
	return color.RGBA{
		R: uint8(float64(src.R)*a + float64(dst.R)*(1-a)),
		G: uint8(float64(src.G)*a + float64(dst.G)*(1-a)),
		B: uint8(float64(src.B)*a + float64(dst.B)*(1-a)),
		A: uint8(float64(src.A) + float64(dst.A)*(1-a)),
	}
}

func rgba(r, g, b, a uint8) color.RGBA {
	return color.RGBA{R: r, G: g, B: b, A: a}
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
