package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAddChannelToGroupCacheInitializesMissingGroup(t *testing.T) {
	cache := map[string]map[string][]int{
		"configured": {},
		"nil-entry":  nil,
	}

	addChannelToGroupCache(cache, "default", "gpt-4o", 1)
	addChannelToGroupCache(cache, "nil-entry", "gpt-4o", 2)

	assert.Equal(t, []int{1}, cache["default"]["gpt-4o"])
	assert.Equal(t, []int{2}, cache["nil-entry"]["gpt-4o"])
}
