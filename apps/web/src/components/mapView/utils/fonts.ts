// Шрифты из Versatiles-стиля. buildSchemeStyle() извлекает их из первого
// symbol-слоя; addPlaceLabelsLayer() читает чтобы text-font совпадал
// с glyphs-хостом стиля. Иначе подписи населённых пунктов отрендерятся
// дефолтным fontstack'ом и MapLibre выкинет 404 на glyph-fetch.
let _fonts: string[] = ["Noto Sans Regular", "Arial Unicode MS Regular"];

export const getVersatilesFonts = (): string[] => _fonts;
export const setVersatilesFonts = (f: string[]): void => { _fonts = f; };
