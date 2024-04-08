.PHONY: install
install:
	npm ci

.PHONY: start
start:
	npm run tauri dev

.PHONY: format
format:
	npm run format

.PHONY: test
test:
	npm test

.PHONY: build
build:
	npm run build && npm run tauri build
