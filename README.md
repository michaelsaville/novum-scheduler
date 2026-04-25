# Novum Scheduler

Mobile-first installer scheduler for Novum Designs.

- 4-installer drag-drop board (scheduler view)
- Phone PWA for installers (today's tasks, notes, photos)
- Independent stack — own Postgres, own volumes

Live at <https://novum.pcc2k.com>.

See `BUILD-NOTES.md` for the canonical, append-only build log.

## Local dev

```bash
docker compose up -d
docker compose exec app npx prisma migrate dev
```

App listens on `127.0.0.1:3008`. Behind the PCC2K nginx (100.91.194.83), reachable as <https://novum.pcc2k.com>.
