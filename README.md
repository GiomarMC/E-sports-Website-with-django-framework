# Esports Web

Backend (REST API) for managing the esports tournaments of the school: games,
public team/player registration with dynamic fees, configurable tournament
formats (groups, single elimination, free for all, manual brackets), match
scheduling, results and live stream links.

Built with **Django** + **Django REST Framework**, JWT authentication and
PostgreSQL (via **Docker**).

## Concepts

| Model | Description |
|---|---|
| `CustomUser` | Staff accounts only. `superadmin` manages everything; `admin` manages only the games assigned to them (`AdminGame`). Players do **not** have accounts. |
| `SiteSettings` | Global configuration: event name, global registration switch and global registration dates. |
| `Game` | Discipline: image, description, rules (text + PDF), `individual`/`team`, min/max players per team. |
| `Tournament` | Edition of a game: fee per player, own registration switch, optional registration dates (override the global ones), slots. |
| `Registration` / `RegistrationMember` | Public registration of a team (or a single player) with its members, one captain and the payment voucher. `amount_due = fee_per_player × members`. It is final once sent: admins only review it (confirm/reject), enable/disable it and set its seed. |
| `Stage` | Phase of a tournament. A tournament is built chaining stages by `order`, e.g. *Groups → Playoffs*. |
| `Match` / `MatchParticipant` | Matches with participants, scores and placements. `next_match` / `loser_next_match` define where winners and losers go. |
| `Stream` | Stream link (Twitch, YouTube, ...) for a game, a match or the whole event, with an `is_live` flag. |

### Stage types

| Type | What the draw generates | Typical use |
|---|---|---|
| `round_robin` | `number_of_groups` groups (snake seeding) where everyone plays everyone (`round_robin_legs` = 2 for home and away). Standings with `points_win/draw/loss`. | Group stage (Dota 2, LoL, Brawl Stars) |
| `single_elimination` | Full bracket with byes for the best seeds when the number of participants is not a power of 2, optional `third_place_match`. Winners advance automatically. | Playoffs, Clash Royale 1v1 |
| `free_for_all` | `ffa_rounds` matches per group with all the participants of the group. The score is the points earned; standings add them. | Battle royale, Left 4 Dead scoring |
| `manual` | Only registers the participants. The admin creates the matches and links them (`next_match`, `loser_next_match`), so any format (e.g. double elimination) can be built. | Special formats |

The first stage takes the confirmed and enabled registrations; the following
stages take the top `advance_per_group` participants of each group of the
previous stage. Participants can also be sent explicitly. The draw can be
repeated until there are results (`POST /stages/{id}/reset/` clears a stage).

### Registration window

Registrations of a tournament are open when: the game is active, the
tournament is `upcoming`, the global switch and the tournament switch are on,
`now` is between the start/end dates (the tournament ones, or the global ones
when empty) and there are slots left.

## Main endpoints

Interactive documentation: **`/api/docs/`** (Swagger) and `/api/redoc/`.
The whole administration (superadmin and game admins) is done through these
endpoints; the Django admin site is not used.

| Endpoint | Access |
|---|---|
| `POST /api/admin/login/` · `POST /api/token/refresh/` · `GET /api/admin/me/` | — / admin |
| `GET,POST /api/admin/` · `PATCH,DELETE /api/admin/{id}/` · `PUT /api/admin/{id}/games/` · `POST /api/admin/{id}/reset-password/` | superadmin |
| `GET,PATCH /api/settings/` | public / superadmin |
| `GET /api/games/` · `POST /api/games/` · `PATCH /api/games/{id}/` · `POST /api/games/{id}/activate/` | public / superadmin / game admin (description, rules, images, bases, team size) |
| `GET /api/tournaments/?game=&status=` · `POST,PATCH,DELETE` · `POST /{id}/open-registration/` · `POST /{id}/close-registration/` | public / game admin |
| `GET /api/tournaments/{id}/quote/?players=6` | public (fee calculation) |
| `POST /api/tournaments/{id}/register/` | public (multipart: `team_name`, `contact_email`, `voucher`, `logo`, `members` as JSON) |
| `GET /api/tournaments/{id}/participants/` · `GET /api/tournaments/{id}/schedule/` | public |
| `GET /api/registrations/status/{code}/` | public |
| `GET /api/registrations/?tournament=&status=&search=` · `POST /{id}/confirm/` · `POST /{id}/reject/` · `POST /{id}/enable/` · `POST /{id}/disable/` · `PATCH` (only `seed`) | game admin |
| `GET /api/stages/?tournament=` · `GET /{id}/standings/` · `GET /{id}/bracket/` | public |
| `POST,PATCH,DELETE /api/stages/` · `POST /{id}/draw/` · `POST /{id}/reset/` · `POST /{id}/auto-schedule/` | game admin |
| `GET /api/matches/?tournament=&stage=&game=&status=&date=&from=&to=&upcoming=true` | public |
| `POST,PATCH,DELETE /api/matches/` · `POST /{id}/result/` · `POST /{id}/reset-result/` | game admin |
| `GET /api/streams/?live=true&game=` · `POST,PATCH,DELETE` | public / game admin (global streams: superadmin) |
| `/api/media/` · `/api/contacts/` | public / superadmin |

Registration example (`members` as a JSON string because of the file upload):

```zsh
curl -X POST http://localhost:8000/api/tournaments/1/register/ \
  -F "team_name=Los Pumas" -F "contact_email=captain@unsa.edu.pe" \
  -F 'members=[{"full_name":"Ana","student_code":"20260001","nickname":"ana","is_captain":true}, ...]' \
  -F "voucher=@voucher.pdf"
```

Results: the admin in charge of the game defines the winner of each match.
The winner advances through the bracket and the loser is eliminated (or goes
to its `loser_next_match`, e.g. the third place match). The score is optional:

```json
POST /api/matches/12/result/
{"winner": 3}
{"winner": 3, "scores": [{"registration": 3, "score": 2}, {"registration": 7, "score": 1}]}
```

When only `scores` are sent, the winner is the highest score. Free for all
matches need the points (`scores`) of every participant; `placement` is
optional (otherwise it is computed from the points). A result can be
corrected while the next match has not been played.

## Requirements

- Python 3.11+
- Docker and Docker Compose (for PostgreSQL)

## Installation

```zsh
git clone https://github.com/GiomarMC/E-sports-Website-with-django-framework.git
cd E-sports-Website-with-django-framework
python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env   # edit the values
docker compose up -d   # PostgreSQL
python manage.py migrate   # also creates the default superadmin
python manage.py runserver
```

Without `POSTGRES_*` / `POSTGRES_URL` variables a local SQLite database is
used.

## Tests

```zsh
python manage.py test esports --verbosity=2
coverage run --source=esports --omit='esports/migrations/*,esports/tests/*' manage.py test esports
coverage report --show-missing
```

## Folder Structure

```
core/                 settings, urls (Swagger in /api/docs/)
esports/
    models.py         data model
    services.py       tournament engine: draws, brackets, results, standings, schedule
    serializers.py
    views.py
    permissions.py    superadmin / game admin permissions
    signals.py        default superadmin
    tests/            factories + tests (models, services, endpoints)
```

## License

MIT
