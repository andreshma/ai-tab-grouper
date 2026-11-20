.PHONY: install lint test coverage package check deploy doctor all

install:
	npm ci

lint:
	npm run lint

test:
	npm test

coverage:
	npm run test:coverage

package:
	npm run package

# Full gate: lint, coverage, audit, package and the Chrome Web Store policy check.
check:
	npm run prepublish:cws

# Copies the runtime to the folder Chrome loads unpacked.
deploy:
	npm run deploy:local

doctor:
	node bridge/doctor.mjs

all: install check
