#!/usr/bin/env bash
#
# Генерирует production keystore для подписи release-APK / AAB
# для RuStore. Запускается ОДИН раз на dev-машине автора.
#
# Output:
#   $HOME/.geobiom/release.keystore  (бинарник, mode 600)
#
# После генерации — НЕ КОММИТИТЬ keystore в git, НЕ ОТПРАВЛЯТЬ
# по почте, НЕ КЛАДЫВАТЬ в публичные облака. Бэкап делать руками
# на encrypted-носитель + распечатанным паспортом / в password-manager.
# Потерянный keystore = невозможность опубликовать update приложения
# навсегда (RuStore не принимает app-update подписанный другим ключом).
#
# Usage:
#   bash apps/mobile/scripts/generate-release-keystore.sh
#
# Параметры (env vars или интерактивно):
#   GEOBIOM_KS_ALIAS    — alias ключа (default: geobiom-release)
#   GEOBIOM_KS_VALIDITY — validity в днях (default: 10000 ≈ 27 лет)
#   GEOBIOM_KS_DNAME    — distinguished name, e.g. "CN=Geobiom,O=Geobiom,C=RU"
#
set -euo pipefail

KEYSTORE_DIR="${HOME}/.geobiom"
KEYSTORE_PATH="${KEYSTORE_DIR}/release.keystore"
ALIAS="${GEOBIOM_KS_ALIAS:-geobiom-release}"
VALIDITY="${GEOBIOM_KS_VALIDITY:-10000}"
DNAME="${GEOBIOM_KS_DNAME:-CN=Geobiom,O=Geobiom,C=RU}"

if [ -e "$KEYSTORE_PATH" ]; then
    echo "ERROR: keystore уже существует: $KEYSTORE_PATH" >&2
    echo "Если ты уверен что хочешь перегенерировать — удали файл вручную." >&2
    echo "ВНИМАНИЕ: после замены keystore'а ВСЕ опубликованные сборки в RuStore" >&2
    echo "перестанут получать апдейты." >&2
    exit 1
fi

mkdir -p "$KEYSTORE_DIR"
chmod 700 "$KEYSTORE_DIR"

# Запросим пароль интерактивно (никогда не передаётся через args/env
# чтобы не утёк в shell history / process listing).
echo "Введи пароль для keystore (минимум 6 символов; сохрани в password-manager):"
read -s -r STORE_PASS
echo
echo "Повтори пароль:"
read -s -r STORE_PASS_CONFIRM
echo
if [ "$STORE_PASS" != "$STORE_PASS_CONFIRM" ]; then
    echo "ERROR: пароли не совпадают" >&2
    exit 1
fi
if [ "${#STORE_PASS}" -lt 6 ]; then
    echo "ERROR: пароль короче 6 символов" >&2
    exit 1
fi

# keytool через JAVA_HOME (тот же JDK 17 что использует Expo).
KEYTOOL="${JAVA_HOME:-}/bin/keytool"
if [ ! -x "$KEYTOOL" ]; then
    KEYTOOL="$(command -v keytool || true)"
fi
if [ -z "$KEYTOOL" ]; then
    echo "ERROR: keytool не найден. Поставь JDK 17 (см. apps/mobile/README.md)." >&2
    exit 1
fi

"$KEYTOOL" -genkeypair -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity "$VALIDITY" \
    -dname "$DNAME" \
    -storepass "$STORE_PASS" \
    -keypass "$STORE_PASS"

chmod 600 "$KEYSTORE_PATH"

# SHA-256 fingerprint — нужно зарегистрировать в RuStore Developer Console
# при первом аплоаде; и сохранить для проверки целостности keystore'а.
echo
echo "Keystore создан: $KEYSTORE_PATH"
echo
echo "SHA-256 fingerprint (сохрани, понадобится для RuStore upload):"
"$KEYTOOL" -list -v -keystore "$KEYSTORE_PATH" -alias "$ALIAS" \
    -storepass "$STORE_PASS" 2>/dev/null \
    | grep -E "SHA256:" || true

echo
echo "Дальше:"
echo "  1. Прочитай apps/mobile/docs/release-signing.md"
echo "  2. Добавь GEOBIOM_KS_PASSWORD в \$HOME/.gradle/gradle.properties"
echo "     (НЕ в репо!) — например:"
echo "       GEOBIOM_KS_PASSWORD=<пароль выше>"
echo "  3. Сделай бэкап файла $KEYSTORE_PATH на encrypted-носитель"
echo "     (потеря = невозможность апдейтить приложение в RuStore)"
