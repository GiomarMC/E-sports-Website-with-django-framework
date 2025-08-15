# Esports Web

A web application for managing esports tournaments, including team/player registration, match scheduling, results tracking, and live stream links.  
Built with **Django** and designed to run seamlessly in a **Docker** environment.

## Project Structure

- `core/`: Main Django configuration (settings, urls, wsgi, asgi).
- `esports/`: Main app containing models, views, admin, and migrations.
- `manage.py`: Django management script.
- `pyproject.toml`: Project dependencies and metadata configuration.
- `docker-compose.yml`: Docker environment configuration.

## Requirements

- Python 3.13+
- Docker and Docker Compose (recommended for development)
- Django (installed via dependencies)

## Environment Variables

Create a `.env` file in the project root with the following variables:

```
POSTGRES_DB=your_database
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_PORT=5432
SECRET_KEY=your_secret_key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:8000
```

## Installation

1. Clone the repository:
   ```zsh
   git clone https://github.com/GiomarMC/Esports_web.git
   cd Esports_web
   ```

2. Install dependencies using the `pyproject.toml` file:
   - Standard installation:
     ```zsh
     pip install .
     ```
   - Editable mode (recommended for development):
     ```zsh
     pip install -e .
     ```

3. Start the database with Docker:
   ```zsh
   docker compose up -d
   ```

## Usage

- Start the development server:
  ```zsh
  python manage.py runserver
  ```
- Apply migrations:
  ```zsh
  python manage.py migrate
  ```
- Create a superuser:
  ```zsh
  python manage.py createsuperuser
  ```

## Folder Structure

```
core/
    settings.py
    urls.py
    ...
esports/
    models.py
    views.py
    admin.py
    migrations/
manage.py
pyproject.toml
docker-compose.yml
```

## Contribution

Contributions are welcome! Please open an issue or pull request for suggestions or improvements.

## License

This project is licensed under the MIT License.
