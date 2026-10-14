# Despliegue en una VM (Azure for Students u Oracle Cloud) con CI/CD

Arquitectura: una VM Ubuntu con Docker Compose.

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

Los pasos 1 a 4 dependen del proveedor (Azure abajo, Oracle en el
anexo); del 5 en adelante son iguales.

---

## 1. Cuenta de Azure for Students

1. Entra a <https://azure.microsoft.com/free/students> → **Start free**.
2. Inicia sesión (o crea una cuenta Microsoft) con tu correo
   **@unsa.edu.pe** y verifica el correo de estudiante y tu teléfono.
   No pide tarjeta.
3. Recibes 100 USD de crédito por 12 meses (renovable mientras seas
   estudiante) y servicios gratis, entre ellos una VM pequeña. Si el
   crédito se acaba, los recursos se detienen: nunca cobra.
4. Saldo restante: <https://www.microsoftazuresponsorships.com/Balance>
   (o en el portal, buscar **Education**).

## 2. Crear la VM

Portal <https://portal.azure.com> → buscar **Virtual machines** →
**Create** → **Azure virtual machine**:

| Pestaña / campo | Valor |
|---|---|
| Resource group | **Create new** → `esports` |
| Virtual machine name | `esports` |
| Region | Una permitida para estudiantes, cercana: *Brazil South* o *East US 2* |
| Availability options | No infrastructure redundancy required |
| Security type | Standard |
| Image | **Ubuntu Server 24.04 LTS - x64 Gen2** |
| Size | **See all sizes** → marca el filtro de **free services eligible** → **B1s** (1 vCPU, 1 GB) |
| Authentication type | SSH public key |
| Username | `ubuntu` |
| SSH public key source | Use existing public key → pega `~/.ssh/id_ed25519.pub` |
| Public inbound ports | Allow selected ports: **SSH (22), HTTP (80), HTTPS (443)** |
| Disks → OS disk type | Premium SSD, tamaño **64 GiB (P6)** (gratis 12 meses) |
| Networking | Deja la red y la IP pública nuevas que propone |
| Management → Auto-shutdown | **Desactivado** |

**Review + create** → **Create**. Al terminar, **Go to resource** y anota
la **Public IP address**.

Si una región sale bloqueada ("not allowed by policy"), prueba otra: las
cuentas de estudiante solo permiten algunas.

## 3. Puertos

Ya quedaron abiertos con *Public inbound ports* (80 y 443). Para revisar:
VM → **Networking** → reglas de entrada con 80 y 443 en *Allow*.

## 4. Dominio gratis (HTTPS)

Azure da uno: VM → clic en la **Public IP address** → **Configuration**:

- **Assignment**: Static.
- **DNS name label**: `esports-epcc` → **Save**.

Tu dominio queda como `esports-epcc.brazilsouth.cloudapp.azure.com` (la
región cambia según la que elegiste). También puedes usar DuckDNS o un
subdominio de la escuela (registro **A** hacia la IP).

### Día del evento: más potencia

La B1s gratis aguanta el uso normal. Unos días antes del evento:
VM → **Size** → **B2s** (2 vCPU, 4 GB) o **B2ms** (2 vCPU, 8 GB) →
**Resize** (reinicia la VM ~1 minuto) y en `.env` pon
`WEB_CONCURRENCY=4` y vuelve a desplegar. Se paga con el crédito (B2s
cuesta alrededor de 1 USD por día). Después del evento vuelve a **B1s**.

## 5. Preparar el servidor

```bash
ssh ubuntu@IP_DE_LA_VM          # escribe "yes" la primera vez
curl -fsSL https://raw.githubusercontent.com/GiomarMC/E-sports-Website-with-django-framework/main/deploy/setup-server.sh | bash
exit            # vuelve a entrar para que el grupo docker aplique
ssh ubuntu@IP_DE_LA_VM
```

Crea swap si la VM tiene poca RAM, instala Docker, abre los puertos,
clona el repo en `/opt/esports` y programa el respaldo diario.

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

Completa todo lo que tiene `<...>`: `DOMAIN`, `SECRET_KEY`,
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
- **Crédito de Azure**: revisa el saldo cada mes. Si se acaba, la VM se
  detiene; con los respaldos fuera del servidor recrearla es repetir los
  pasos 2 a 8.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| El certificado no se emite (logs de `web`) | El dominio no apunta a la IP, o faltan las reglas del paso 3 |
| La construcción se corta o la VM se congela | Poca RAM: revisa que exista swap (`free -h`) |
| `ERR_CONNECTION_REFUSED` | Puertos cerrados (paso 3) o `web` caído (`ps`) |
| 400 Bad Request | El dominio no está en `ALLOWED_HOSTS` |
| La API no queda *healthy* en el deploy | Revisa `logs backend`: `.env` incompleto o `SECRET_KEY` corta |
| El deploy de Actions falla con *Permission denied* | Llave o `SSH_KNOWN_HOSTS` mal copiados |

---

## Anexo: Oracle Cloud (Always Free)

Si tienes una cuenta de Oracle: VM **VM.Standard.A1.Flex** (ARM, hasta 4
OCPU y 24 GB, *Always Free-eligible*) con **Canonical Ubuntu 24.04** y
boot volume de 100 GB. Abre 80 y 443 en VCN → Security Lists → *Default
Security List* → **Add Ingress Rules** (`0.0.0.0/0`, TCP). Dominio con
DuckDNS (<https://www.duckdns.org>) apuntando a la IP. Con 24 GB usa
`WEB_CONCURRENCY=8`. Luego sigue desde el paso 5.
