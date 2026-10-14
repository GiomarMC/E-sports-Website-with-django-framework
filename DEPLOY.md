# Despliegue en Oracle Cloud (Always Free) con CI/CD

Arquitectura: una VM ARM de Oracle con Docker Compose.

```
Internet ──443──> Caddy (HTTPS automático, frontend, /media)
                    └──/api──> Django + gunicorn ──> PostgreSQL
```

- Cada push a `main` corre los tests en GitHub Actions y, si pasan, entra
  por SSH a la VM y ejecuta `deploy/deploy.sh` (actualiza el código,
  reconstruye y reinicia; las migraciones se aplican solas).
- Respaldo diario de la base de datos y los archivos a las 03:30.

Archivos: `Dockerfile` (API), `deploy/Dockerfile.web` (frontend + Caddy),
`deploy/Caddyfile`, `docker-compose.prod.yml`, `deploy/*.sh`,
`.github/workflows/ci-cd.yml`.

---

## 1. Cuenta de Oracle Cloud

1. Regístrate en <https://signup.cloud.oracle.com>. Pide una tarjeta solo
   para verificar; no cobra mientras uses recursos **Always Free**.
2. **Home region**: elige una cercana (São Paulo, Santiago o Querétaro).
   No se puede cambiar y los recursos gratis solo existen ahí.
3. Billing → Budgets → crea un presupuesto de **1 USD** con alerta por
   correo. Si algo empezara a cobrar, te enteras.

## 2. Crear la VM

Menú → Compute → Instances → **Create instance**:

| Campo | Valor |
|---|---|
| Name | `esports` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | Ampere → **VM.Standard.A1.Flex**, 4 OCPU y 24 GB (o 2 y 12) |
| Networking | Crear VCN nueva con subred **pública** y **asignar IPv4 pública** |
| SSH keys | Sube tu llave pública (`~/.ssh/id_ed25519.pub`) o descarga la que genera |
| Boot volume | 100 GB |

Verifica que diga **Always Free-eligible** y crea. Si sale *Out of
capacity*, reintenta más tarde u otro *availability domain*.

Anota la **IP pública**. (Si el panel lo permite, conviértela en *Reserved
public IP* para que no cambie nunca.)

## 3. Abrir los puertos 80 y 443

Networking → Virtual cloud networks → tu VCN → Security Lists → *Default
Security List* → **Add Ingress Rules** (Source CIDR `0.0.0.0/0`):

- TCP, destination port `80`
- TCP, destination port `443`
- UDP, destination port `443` (HTTP/3, opcional)

El firewall interno de Ubuntu lo abre el script del paso 5.

## 4. Dominio (HTTPS)

Opción gratis: **DuckDNS**.

1. Entra a <https://www.duckdns.org> con tu cuenta de GitHub.
2. Crea un subdominio, p. ej. `esports-epcc` → `esports-epcc.duckdns.org`.
3. En *current ip* pon la IP pública de la VM y guarda.

(Si la escuela te da `esports.epcc.unsa.edu.pe`, pide un registro **A**
hacia la IP de la VM y usa ese dominio en el paso 6.)

## 5. Preparar el servidor

```bash
ssh ubuntu@IP_DE_LA_VM
curl -fsSL https://raw.githubusercontent.com/GiomarMC/E-sports-Website-with-django-framework/main/deploy/setup-server.sh | bash
exit            # vuelve a entrar para que el grupo docker aplique
ssh ubuntu@IP_DE_LA_VM
```

Instala Docker, abre los puertos, clona el repo en `/opt/esports` y
programa el respaldo diario.

## 6. Configuración (.env)

```bash
cd /opt/esports
cp deploy/env.production.example .env
# valores aleatorios para SECRET_KEY y POSTGRES_PASSWORD:
docker run --rm python:3.13-slim python -c "import secrets; print(secrets.token_urlsafe(64))"
docker run --rm python:3.13-slim python -c "import secrets; print(secrets.token_urlsafe(32))"
nano .env
chmod 600 .env
```

Completa todo lo que tiene `<...>`: `DOMAIN`, `ACME_EMAIL`, `SECRET_KEY`,
`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `POSTGRES_PASSWORD` y
`DEFAULT_SUPERADMIN_PASSWORD` (12+ caracteres, no solo números).

## 7. Primer despliegue

```bash
./deploy/deploy.sh
```

La primera vez tarda unos minutos (construye las imágenes en la VM). Abre
`https://TU_DOMINIO`: Caddy pide el certificado solo. Entra a
`https://TU_DOMINIO/admin` con el superadmin del `.env`.

Útil:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env logs -f web
```

## 8. (Opcional) Subir los datos que ya tienes en local

En **tu PC** (la base de datos local corre en el contenedor `esports_db`;
usuario y base son los de tu `.env` local):

```bash
cd ~/Universidad/Esports
docker exec esports_db pg_dump -U <POSTGRES_USER> -d <POSTGRES_DB> --format=custom > local.dump
tar -czf local-files.tar.gz media private_media
scp local.dump local-files.tar.gz ubuntu@IP_DE_LA_VM:/tmp/
```

En el **servidor**:

```bash
cd /opt/esports
./deploy/restore.sh /tmp/local.dump /tmp/local-files.tar.gz
rm /tmp/local.dump /tmp/local-files.tar.gz
```

Ojo: se reemplaza toda la base, **incluidos los usuarios**. El superadmin
pasa a ser el de tu base local, con su contraseña local: cámbiala en el
panel apenas entres. Si vienen datos de prueba (seed_demo), bórralos antes
o no subas la base.

## 9. CI/CD (GitHub Actions)

1. En **tu PC**, crea una llave solo para desplegar:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/esports_deploy -N "" -C github-deploy
   ```

2. En el **servidor**, autorízala **solo** para ejecutar el despliegue
   (aunque la roben no da una consola):

   ```bash
   echo 'command="/opt/esports/deploy/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty PEGA_AQUI_EL_CONTENIDO_DE_esports_deploy.pub' >> ~/.ssh/authorized_keys
   ```

3. En **tu PC**, obtén la huella del servidor:

   ```bash
   ssh-keyscan -H IP_DE_LA_VM
   ```

4. En GitHub: repo → Settings → Environments → **New environment**
   `production` (si quieres, marca *Required reviewers* para aprobar cada
   despliegue). Dentro, en *Environment secrets*, agrega:

   | Secret | Valor |
   |---|---|
   | `SSH_HOST` | IP de la VM |
   | `SSH_USER` | `ubuntu` |
   | `SSH_PRIVATE_KEY` | contenido de `~/.ssh/esports_deploy` (la privada, completa) |
   | `SSH_KNOWN_HOSTS` | salida de `ssh-keyscan` del paso 3 |

5. Haz un push a `main` (o Actions → CI/CD → *Run workflow*). Verás los
   jobs `backend`, `frontend` y `deploy`.

En otras ramas y pull requests solo corren los tests.

## 10. Mantenimiento

- **Respaldos**: `/var/backups/esports` (14 días). Bájalos a tu PC de vez
  en cuando, porque si se pierde la VM se pierden con ella:
  `scp -r ubuntu@IP_DE_LA_VM:/var/backups/esports ./respaldos`
- **Restaurar**: `./deploy/restore.sh db-XXXX.dump files-XXXX.tar.gz`
- **HSTS**: cuando HTTPS funcione bien unos días, sube
  `SECURE_HSTS_SECONDS` a `31536000` en `.env` y vuelve a desplegar.
- **Actualizar Ubuntu**: `sudo apt update && sudo apt upgrade -y` cada
  cierto tiempo (y `sudo reboot` si lo pide).
- **VM inactiva**: Oracle puede reclamar VMs Always Free con muy poco uso
  durante 7 días en cuentas sin Pay As You Go. Con los respaldos fuera del
  servidor, recrearla es repetir los pasos 2 a 8.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| El certificado no se emite (logs de `web`) | DuckDNS no apunta a la IP, o faltan las reglas del paso 3 |
| `ERR_CONNECTION_REFUSED` | Puertos cerrados (paso 3) o `web` caído (`ps`) |
| 400 Bad Request | El dominio no está en `ALLOWED_HOSTS` |
| La API no queda *healthy* en el deploy | Revisa `logs backend`: `.env` incompleto o `SECRET_KEY` corta |
| El deploy de Actions falla con *Permission denied* | Llave o `SSH_KNOWN_HOSTS` mal copiados |
