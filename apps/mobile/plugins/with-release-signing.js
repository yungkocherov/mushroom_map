/**
 * Expo config-plugin: вписывает release signingConfig в android/app/build.gradle
 * сразу после `expo prebuild`. Без этого prebuild --clean каждый раз сбрасывает
 * release-build на debug.keystore (см. дефолтный шаблон Expo bare).
 *
 * Подключается из app.json → "plugins": [..., "./plugins/with-release-signing"].
 *
 * Реальный keystore-файл и пароль НЕ в репо — они читаются из:
 *   - $HOME/.geobiom/release.keystore (storeFile)
 *   - $HOME/.gradle/gradle.properties (storePassword + keyPassword через
 *     GEOBIOM_KS_PASSWORD; alias через GEOBIOM_KS_ALIAS, default 'geobiom-release')
 *
 * Если эти файлы отсутствуют — `gradlew :app:assembleRelease` упадёт с
 * понятным сообщением, debug-сборки продолжают работать (они на debug.keystore).
 *
 * См. apps/mobile/docs/release-signing.md
 */

const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_BLOCK = `
    signingConfigs {
        release {
            // Path и пароль читаются из gradle.properties / env, чтобы
            // ни keystore, ни secret-ы не попадали в git. См.
            // apps/mobile/docs/release-signing.md.
            storeFile file(System.getenv('GEOBIOM_KS_PATH') ?: "\${System.getenv('HOME') ?: System.getenv('USERPROFILE')}/.geobiom/release.keystore")
            storePassword project.findProperty('GEOBIOM_KS_PASSWORD') ?: System.getenv('GEOBIOM_KS_PASSWORD') ?: ''
            keyAlias project.findProperty('GEOBIOM_KS_ALIAS') ?: System.getenv('GEOBIOM_KS_ALIAS') ?: 'geobiom-release'
            keyPassword project.findProperty('GEOBIOM_KS_PASSWORD') ?: System.getenv('GEOBIOM_KS_PASSWORD') ?: ''
        }
    }
`.trim();

/**
 * Вставляем `release { ... }` внутри существующего `signingConfigs { ... debug { ... } }`-блока.
 * Затем переключаем `release` build-type'у на signingConfigs.release.
 */
function patch(contents) {
    let next = contents;

    // 1) Добавить release inside signingConfigs { debug { ... } }
    if (!next.match(/signingConfigs\s*\{[^}]*release\s*\{/s)) {
        next = next.replace(
            /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*)\}/s,
            (match, debugBlock) => {
                // Вставим release-блок после debug-блока, перед закрывающей `}`
                const releaseInner = RELEASE_BLOCK
                    .replace(/^\s*signingConfigs\s*\{\s*/, "")
                    .replace(/\s*\}\s*$/, "");
                return `${debugBlock}${releaseInner}\n    }`;
            },
        );
    }

    // 2) Переключить buildTypes.release.signingConfig с debug на release.
    //    `.*?` через [\s\S] чтобы съесть закрывающий `}` debug-блока внутри
    //    buildTypes (regex с `[^}]*` не пробивал nested braces).
    next = next.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+)signingConfigs\.debug/,
        "$1signingConfigs.release",
    );

    return next;
}

module.exports = function withReleaseSigning(config) {
    return withAppBuildGradle(config, (cfg) => {
        cfg.modResults.contents = patch(cfg.modResults.contents);
        return cfg;
    });
};

// Экспорт для unit-теста (вне Expo runtime)
module.exports._patch = patch;
