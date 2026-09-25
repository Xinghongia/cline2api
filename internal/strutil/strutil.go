// Package strutil 提供跨包使用的字符串小工具。
package strutil

// Truncate 截断超长字符串并加省略号（用于日志与错误信息）。
func Truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
