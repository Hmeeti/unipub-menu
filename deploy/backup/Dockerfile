FROM postgres:18-alpine
RUN apk add --no-cache aws-cli tzdata
COPY backup.sh restore.sh /usr/local/bin/
# 05:15 Asia/Almaty — after closing time.
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
 && echo "15 5 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
CMD ["crond", "-f", "-l", "2"]
