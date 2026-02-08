.PHONY: setup up down logs help prod fix-content migrate

help:
	@echo "Available commands:"
	@echo "  make up          - Run setup (if needed) and start the stack"
	@echo "  make down        - Stop the stack"
	@echo "  make logs        - View logs"
	@echo "  make prod        - Run with production overrides"
	@echo "  make setup       - Generate secrets (infra/.env) manually"
	@echo "  make fix-content - Fix corrupted BlockNote content in database"
	@echo "  make migrate     - Run database migrations"

setup:
	@if [ ! -f infra/.env ]; then \
		echo "Running first-time setup..."; \
		cd infra && ./setup.sh; \
	else \
		echo "Setup already complete (infra/.env exists)."; \
	fi

up: setup
	cd infra && docker compose up -d

down:
	cd infra && docker compose down

logs:
	cd infra && docker compose logs -f

prod: setup
	cd infra && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

fix-content:
	@echo "Fixing corrupted BlockNote content..."
	cd infra && docker compose exec -T postgres psql -U postgres -d roka -f /docker-entrypoint-initdb.d/fix-blocknote-content.sql
	@echo "Done! Refresh your browser to see the fixed content."

migrate:
	@echo "Running database migrations..."
	@for f in database/migrations/*.sql; do \
		echo "  Applying $$f..."; \
		cd infra && docker compose exec -T db psql -U postgres -d roka -f /migrations/$$(basename $$f) && cd ..; \
	done
	@echo "Migrations complete."
