.PHONY: setup up down logs help prod migrate health reset fix-content

help:
	@echo "Available commands:"
	@echo "  make up          - Run setup (if needed) and start the stack"
	@echo "  make down        - Stop the stack"
	@echo "  make logs        - View logs"
	@echo "  make prod        - Run with production overrides"
	@echo "  make setup       - Generate secrets (infra/.env) manually"
	@echo "  make migrate     - Run database migrations"
	@echo "  make health      - Check service status"
	@echo "  make reset       - Wipe DB and restart fresh (dev only)"
	@echo "  make fix-content - Fix corrupted BlockNote content"

setup:
	@if [ ! -f infra/.env ]; then \
		echo "Running first-time setup..."; \
		cd infra && ./setup.sh; \
	elif [ ! -f infra/seaweedfs-s3.json ]; then \
		echo "Adding object storage config..."; \
		cd infra && ./setup.sh || true; \
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

migrate:
	@echo "Running database migrations..."
	@for f in database/migrations/*.sql; do \
		echo "  Applying $$f..."; \
		(cd infra && docker compose exec -T db psql -U postgres -d postgres -f /migrations/$$(basename $$f)); \
	done
	@echo "Migrations complete."

health:
	@cd infra && docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

reset:
	@echo "⚠ This will destroy all data. Press Ctrl+C to cancel."
	@sleep 3
	cd infra && docker compose down -v
	cd infra && docker compose up -d db
	@echo "Waiting for DB to be ready..."
	@sleep 5
	@$(MAKE) migrate
	@echo "Database reset complete. Run 'make up' to start all services."

fix-content:
	@echo "Fixing corrupted BlockNote content..."
	@cd infra && cat ../database/scripts/fix-blocknote-content.sql | docker compose exec -T db psql -U postgres -d postgres
	@echo "Done. Refresh your browser."
