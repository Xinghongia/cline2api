package randx

import "crypto/rand"

func Intn(n int) int {
	if n <= 0 {
		return 0
	}
	b := make([]byte, 4)
	rand.Read(b)
	v := int(b[0])<<24 | int(b[1])<<16 | int(b[2])<<8 | int(b[3])
	if v < 0 {
		v = -v
	}
	return v % n
}
