// Generated from design/tokens/paldora.tokens.json by `pnpm tokens:generate`. Do not edit.
// Units: dimensions are Float dp/sp (rem x 16; em stays a ratio),
// durations are Int milliseconds, colors are Long 0xAARRGGBB sRGB values
// (pass to androidx.compose.ui.graphics.Color(Long) in the app).
package app.paldora.tokens

object PaldoraTokens {
    const val themeLightBgCanvas: Long = 0xFFF4EFE7L
    const val themeLightBgSurface: Long = 0xFFFBF8F3L
    const val themeLightBgSunken: Long = 0xFFEAE2D5L
    const val themeLightBgInverse: Long = 0xFF2A2420L
    const val themeLightBgInverseRaised: Long = 0xFF3A322CL
    const val themeLightBgPaper: Long = 0xFFFFFFFFL
    const val themeLightTextPrimary: Long = 0xFF1D1A17L
    const val themeLightTextSecondary: Long = 0xFF4F473FL
    const val themeLightTextMuted: Long = 0xFF8C8276L
    const val themeLightTextOnInverse: Long = 0xFFFBF8F3L
    const val themeLightBorderHairline: Long = 0xFFE2D9CBL
    const val themeLightAccentBrass: Long = 0xFFA9823FL
    const val themeLightAccentBrassText: Long = 0xFF7A5B24L
    const val themeLightAccentBrassSoft: Long = 0xFFF1E6CFL
    const val themeLightAccentEmber: Long = 0xFFB65A3CL
    const val themeLightAccentEmberSoft: Long = 0xFFF6E1D6L
    const val themeLightAccentSage: Long = 0xFF6F7D64L
    const val themeLightAccentSageSoft: Long = 0xFFE4E8DCL
    const val themeLightAccentOnBrass: Long = 0xFF1D1A17L
    const val themeLightActionPrimary: Long = 0xFF2A2420L
    const val themeLightActionOnPrimary: Long = 0xFFFBF8F3L
    const val themeLightFocusRing: Long = 0xFF8D6CD1L
    const val themeLightStatusDanger: Long = 0xFFA54B46L
    const val themeLightStatusSuccess: Long = 0xFF5B7255L
    const val themeLightNavActive: Long = 0xFFFBF8F3L
    const val themeLightNavOnActive: Long = 0xFF1D1A17L
    const val themeDarkBgCanvas: Long = 0xFF14110EL
    const val themeDarkBgSurface: Long = 0xFF1D1915L
    const val themeDarkBgSunken: Long = 0xFF27221DL
    const val themeDarkBgInverse: Long = 0xFF2C2621L
    const val themeDarkBgInverseRaised: Long = 0xFF3A332CL
    const val themeDarkBgPaper: Long = 0xFFF1EBE1L
    const val themeDarkTextPrimary: Long = 0xFFF2EBDFL
    const val themeDarkTextSecondary: Long = 0xFFC9BDABL
    const val themeDarkTextMuted: Long = 0xFF908574L
    const val themeDarkTextOnInverse: Long = 0xFFFBF8F3L
    const val themeDarkBorderHairline: Long = 0xFF352E27L
    const val themeDarkAccentBrass: Long = 0xFFC39A52L
    const val themeDarkAccentBrassText: Long = 0xFFD9B26AL
    const val themeDarkAccentBrassSoft: Long = 0xFF3A2F1EL
    const val themeDarkAccentEmber: Long = 0xFFD67A5CL
    const val themeDarkAccentEmberSoft: Long = 0xFF3D241BL
    const val themeDarkAccentSage: Long = 0xFF9AAA8CL
    const val themeDarkAccentSageSoft: Long = 0xFF263022L
    const val themeDarkAccentOnBrass: Long = 0xFF1D1A17L
    const val themeDarkActionPrimary: Long = 0xFFF2EBDFL
    const val themeDarkActionOnPrimary: Long = 0xFF1D1A17L
    const val themeDarkFocusRing: Long = 0xFFC8B7E8L
    const val themeDarkStatusDanger: Long = 0xFFE08A84L
    const val themeDarkStatusSuccess: Long = 0xFF9DB596L
    const val themeDarkNavActive: Long = 0xFFF2EBDFL
    const val themeDarkNavOnActive: Long = 0xFF1D1A17L
    const val space1: Float = 4f
    const val space2: Float = 8f
    const val space3: Float = 12f
    const val space4: Float = 16f
    const val space5: Float = 20f
    const val space6: Float = 24f
    const val space8: Float = 32f
    const val space10: Float = 40f
    const val space12: Float = 48f
    const val space16: Float = 64f
    const val space20: Float = 80f
    const val radiusSm: Float = 8f
    const val radiusMd: Float = 16f
    const val radiusLg: Float = 24f
    const val radiusXl: Float = 28f
    const val radiusSheet: Float = 30f
    const val radiusPill: Float = 999f
    const val sizeTouchTarget: Float = 44f
    const val sizeFocusRing: Float = 3f
    const val sizeReadingColumn: Float = 620f
    const val sizeContentMax: Float = 1280f
    const val breakpointSm: Float = 390f
    const val breakpointMd: Float = 768f
    const val breakpointLg: Float = 1024f
    const val breakpointXl: Float = 1280f
    const val breakpointXxl: Float = 1440f
    const val durationFast: Int = 120
    const val durationStandard: Int = 200
    const val durationSlow: Int = 320
    val easingStandard: List<Float> = listOf(0.2f, 0.8f, 0.2f, 1f)
    const val zIndexBase: Int = 0
    const val zIndexSticky: Int = 100
    const val zIndexDropdown: Int = 300
    const val zIndexOverlay: Int = 500
    const val zIndexModal: Int = 600
    const val zIndexToast: Int = 700
    const val zIndexSecurity: Int = 800
    val fontDisplay: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    val fontUi: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    val fontMono: List<String> = listOf("Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace")
    val fontBrand: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    val fontEditorial: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val borderWidthHairline: Float = 1f
    const val borderWidthFocus: Float = 1.5f
    const val borderOpacitySoft: Float = 0.12f
    const val borderOpacityDefault: Float = 0.2f
    const val borderOpacityStrong: Float = 0.5f
    const val fontSizeCaption: Float = 13f
    const val fontSizeHeroSmall: Float = 44f
    const val fontSizeHeroLarge: Float = 72f
    const val fontSizeLead: Float = 18f
    const val fontSizeSm: Float = 14f
    const val fontSizeSubtitle: Float = 20f
    const val fontSizeTitleSmall: Float = 28f
    const val fontSizeDisplay: Float = 36f
    const val fontSizeBody: Float = 16f
    const val fontSizeBrandSmall: Float = 20.8f
    const val fontSizeDisplayLarge: Float = 40f
    const val fontSizeHeadingSmall: Float = 22f
    const val fontSizeHeading: Float = 24f
    const val fontSizeXs: Float = 12f
    const val fontSizeTitle: Float = 30f
    const val fontSizeBodyLarge: Float = 17f
    const val fontSizeRelativeLabel: Float = 0.75f
    const val fontSizeDisplaySmall: Float = 32f
    const val fontSizeReadable: Float = 15f
    const val fontSizeHero: Float = 48f
    const val fontSizeRelativeSmall: Float = 0.7f
    val typeDisplayXlFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeDisplayXlFontWeight: Int = 300
    const val typeDisplayXlFontSize: Float = 76f
    const val typeDisplayXlLineHeight: Float = 78f
    const val typeDisplayXlTracking: Float = -0.025f
    val typeDisplayLFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeDisplayLFontWeight: Int = 300
    const val typeDisplayLFontSize: Float = 44f
    const val typeDisplayLLineHeight: Float = 48f
    const val typeDisplayLTracking: Float = -0.025f
    val typeDisplayMFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeDisplayMFontWeight: Int = 300
    const val typeDisplayMFontSize: Float = 34f
    const val typeDisplayMLineHeight: Float = 38f
    const val typeDisplayMTracking: Float = -0.025f
    val typeDisplayAccentFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeDisplayAccentFontWeight: Int = 300
    const val typeDisplayAccentFontSize: Float = 34f
    const val typeDisplayAccentLineHeight: Float = 38f
    const val typeDisplayAccentTracking: Float = -0.025f
    const val typeDisplayAccentFontStyle: String = "italic"
    val typeTitleLFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeTitleLFontWeight: Int = 400
    const val typeTitleLFontSize: Float = 26f
    const val typeTitleLLineHeight: Float = 32f
    const val typeTitleLTracking: Float = -0.015f
    val typeTitleMFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeTitleMFontWeight: Int = 400
    const val typeTitleMFontSize: Float = 22f
    const val typeTitleMLineHeight: Float = 28f
    const val typeTitleMTracking: Float = -0.01f
    val typeTitleSFontFamily: List<String> = listOf("Fraunces", "Iowan Old Style", "Georgia", "serif")
    const val typeTitleSFontWeight: Int = 400
    const val typeTitleSFontSize: Float = 18f
    const val typeTitleSLineHeight: Float = 24f
    const val typeTitleSTracking: Float = 0f
    val typeBodyLFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeBodyLFontWeight: Int = 400
    const val typeBodyLFontSize: Float = 17f
    const val typeBodyLLineHeight: Float = 26f
    const val typeBodyLTracking: Float = 0f
    val typeBodyMFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeBodyMFontWeight: Int = 400
    const val typeBodyMFontSize: Float = 15f
    const val typeBodyMLineHeight: Float = 21f
    const val typeBodyMTracking: Float = 0f
    val typeBodySFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeBodySFontWeight: Int = 400
    const val typeBodySFontSize: Float = 13f
    const val typeBodySLineHeight: Float = 18f
    const val typeBodySTracking: Float = 0f
    val typeLabelMFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeLabelMFontWeight: Int = 500
    const val typeLabelMFontSize: Float = 15f
    const val typeLabelMLineHeight: Float = 20f
    const val typeLabelMTracking: Float = 0f
    val typeLabelSFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeLabelSFontWeight: Int = 500
    const val typeLabelSFontSize: Float = 13f
    const val typeLabelSLineHeight: Float = 18f
    const val typeLabelSTracking: Float = 0f
    val typeLabelXsFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeLabelXsFontWeight: Int = 500
    const val typeLabelXsFontSize: Float = 10f
    const val typeLabelXsLineHeight: Float = 12f
    const val typeLabelXsTracking: Float = 0f
    val typeEyebrowFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeEyebrowFontWeight: Int = 500
    const val typeEyebrowFontSize: Float = 11f
    const val typeEyebrowLineHeight: Float = 14f
    const val typeEyebrowTracking: Float = 0.14f
    val typeCaptionFontFamily: List<String> = listOf("Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif")
    const val typeCaptionFontWeight: Int = 400
    const val typeCaptionFontSize: Float = 12f
    const val typeCaptionLineHeight: Float = 16f
    const val typeCaptionTracking: Float = 0f
    const val elevationSoftX: Float = 0f
    const val elevationSoftY: Float = 6f
    const val elevationSoftBlur: Float = 24f
    const val elevationSoftSpread: Float = 0f
    const val elevationSoftColor: Long = 0x123D2B1AL
    const val elevationLiftX: Float = 0f
    const val elevationLiftY: Float = 14f
    const val elevationLiftBlur: Float = 36f
    const val elevationLiftSpread: Float = 0f
    const val elevationLiftColor: Long = 0x29332112L
    const val layoutIphoneWidth: Float = 402f
    const val layoutIphoneHeight: Float = 874f
    const val layoutStatusBarHeight: Float = 58f
    const val layoutHomeIndicatorHeight: Float = 34f
    const val layoutTabBarWidth: Float = 370f
    const val layoutTabBarHeight: Float = 64f
    const val layoutTabBarTop: Float = 774f
    const val layoutMobileGutter: Float = 20f
    const val layoutWebSidebar: Float = 264f
    const val layoutWebPagePadding: Float = 48f
    const val layoutWebColumnGap: Float = 40f
    const val layoutWebFeedColumn: Float = 660f
    const val layoutWebRightRail: Float = 388f
    const val iconSize: Float = 24f
    const val iconStroke: Float = 1.6f
    const val iconStrokeActive: Float = 1.8f
}

/** Semantic colors for the Light appearance (color/bg/canvas = bgCanvas). */
object PaldoraLightColors {
    const val bgCanvas: Long = 0xFFF4EFE7L
    const val bgSurface: Long = 0xFFFBF8F3L
    const val bgSunken: Long = 0xFFEAE2D5L
    const val bgInverse: Long = 0xFF2A2420L
    const val bgInverseRaised: Long = 0xFF3A322CL
    const val bgPaper: Long = 0xFFFFFFFFL
    const val textPrimary: Long = 0xFF1D1A17L
    const val textSecondary: Long = 0xFF4F473FL
    const val textMuted: Long = 0xFF8C8276L
    const val textOnInverse: Long = 0xFFFBF8F3L
    const val borderHairline: Long = 0xFFE2D9CBL
    const val accentBrass: Long = 0xFFA9823FL
    const val accentBrassText: Long = 0xFF7A5B24L
    const val accentBrassSoft: Long = 0xFFF1E6CFL
    const val accentEmber: Long = 0xFFB65A3CL
    const val accentEmberSoft: Long = 0xFFF6E1D6L
    const val accentSage: Long = 0xFF6F7D64L
    const val accentSageSoft: Long = 0xFFE4E8DCL
    const val accentOnBrass: Long = 0xFF1D1A17L
    const val actionPrimary: Long = 0xFF2A2420L
    const val actionOnPrimary: Long = 0xFFFBF8F3L
    const val focusRing: Long = 0xFF8D6CD1L
    const val statusDanger: Long = 0xFFA54B46L
    const val statusSuccess: Long = 0xFF5B7255L
    const val navActive: Long = 0xFFFBF8F3L
    const val navOnActive: Long = 0xFF1D1A17L
}

/** Semantic colors for the Dark appearance; same names as [PaldoraLightColors]. */
object PaldoraDarkColors {
    const val bgCanvas: Long = 0xFF14110EL
    const val bgSurface: Long = 0xFF1D1915L
    const val bgSunken: Long = 0xFF27221DL
    const val bgInverse: Long = 0xFF2C2621L
    const val bgInverseRaised: Long = 0xFF3A332CL
    const val bgPaper: Long = 0xFFF1EBE1L
    const val textPrimary: Long = 0xFFF2EBDFL
    const val textSecondary: Long = 0xFFC9BDABL
    const val textMuted: Long = 0xFF908574L
    const val textOnInverse: Long = 0xFFFBF8F3L
    const val borderHairline: Long = 0xFF352E27L
    const val accentBrass: Long = 0xFFC39A52L
    const val accentBrassText: Long = 0xFFD9B26AL
    const val accentBrassSoft: Long = 0xFF3A2F1EL
    const val accentEmber: Long = 0xFFD67A5CL
    const val accentEmberSoft: Long = 0xFF3D241BL
    const val accentSage: Long = 0xFF9AAA8CL
    const val accentSageSoft: Long = 0xFF263022L
    const val accentOnBrass: Long = 0xFF1D1A17L
    const val actionPrimary: Long = 0xFFF2EBDFL
    const val actionOnPrimary: Long = 0xFF1D1A17L
    const val focusRing: Long = 0xFFC8B7E8L
    const val statusDanger: Long = 0xFFE08A84L
    const val statusSuccess: Long = 0xFF9DB596L
    const val navActive: Long = 0xFFF2EBDFL
    const val navOnActive: Long = 0xFF1D1A17L
}

enum class PaldoraRoomScheme { LIGHT, DARK }

data class PaldoraRoomPreset(
    val id: String,
    val scheme: PaldoraRoomScheme,
    val canvas: Long,
    val surface: Long,
    val text: Long,
    val textMuted: Long,
    val border: Long,
)

data class PaldoraRoomAccent(val key: String, val onLight: Long, val onDark: Long) {
    fun color(scheme: PaldoraRoomScheme): Long =
        if (scheme == PaldoraRoomScheme.LIGHT) onLight else onDark
}

data class PaldoraRoomFont(val key: String, val families: List<String>)

/** Room themes (ADR 017), keyed by the domain ids used by the API. */
object PaldoraRoomThemes {
    val presets: List<PaldoraRoomPreset> = listOf(
        PaldoraRoomPreset(
            id = "obsidian_gold",
            scheme = PaldoraRoomScheme.DARK,
            canvas = 0xFF14110DL,
            surface = 0xFF211B14L,
            text = 0xFFF7EFD9L,
            textMuted = 0xFF8D887AL,
            border = 0xFF726C5FL,
        ),
        PaldoraRoomPreset(
            id = "cream_paper",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFF8F0DFL,
            surface = 0xFFFFFAF0L,
            text = 0xFF241D16L,
            textMuted = 0xFF6F685DL,
            border = 0xFF8B857CL,
        ),
        PaldoraRoomPreset(
            id = "lavender_dream",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFEEE6FAL,
            surface = 0xFFFAF7FFL,
            text = 0xFF2E2140L,
            textMuted = 0xFF6B607CL,
            border = 0xFF867D92L,
        ),
        PaldoraRoomPreset(
            id = "ocean_glow",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFDFF5F4L,
            surface = 0xFFF5FFFFL,
            text = 0xFF102F39L,
            textMuted = 0xFF526E75L,
            border = 0xFF74898FL,
        ),
        PaldoraRoomPreset(
            id = "daisy_day",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFFFF4C9L,
            surface = 0xFFFFFBEDL,
            text = 0xFF3A3115L,
            textMuted = 0xFF746B4AL,
            border = 0xFF8F8872L,
        ),
        PaldoraRoomPreset(
            id = "neon_night",
            scheme = PaldoraRoomScheme.DARK,
            canvas = 0xFF100D20L,
            surface = 0xFF211839L,
            text = 0xFFF8F2FFL,
            textMuted = 0xFF8C8897L,
            border = 0xFF716982L,
        ),
        PaldoraRoomPreset(
            id = "y2k_glitter",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFF2E8FAL,
            surface = 0xFFFFF7FFL,
            text = 0xFF352044L,
            textMuted = 0xFF71607EL,
            border = 0xFF8C7C94L,
        ),
        PaldoraRoomPreset(
            id = "dark_academia",
            scheme = PaldoraRoomScheme.DARK,
            canvas = 0xFF211B14L,
            surface = 0xFF30271CL,
            text = 0xFFF1DFBDL,
            textMuted = 0xFFA0937BL,
            border = 0xFF817460L,
        ),
        PaldoraRoomPreset(
            id = "frutiger_aero",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFDFF7FFL,
            surface = 0xFFF7FFFFL,
            text = 0xFF12374AL,
            textMuted = 0xFF4D6F7EL,
            border = 0xFF728B96L,
        ),
        PaldoraRoomPreset(
            id = "tumblr_2014",
            scheme = PaldoraRoomScheme.DARK,
            canvas = 0xFF263247L,
            surface = 0xFF34445FL,
            text = 0xFFF5F7FBL,
            textMuted = 0xFFB1B6C0L,
            border = 0xFF8A94A4L,
        ),
        PaldoraRoomPreset(
            id = "retro_windows",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFC0C0C0L,
            surface = 0xFFECECECL,
            text = 0xFF101010L,
            textMuted = 0xFF4A4A4AL,
            border = 0xFF656565L,
        ),
        PaldoraRoomPreset(
            id = "cyberpunk",
            scheme = PaldoraRoomScheme.DARK,
            canvas = 0xFF110B1BL,
            surface = 0xFF21122DL,
            text = 0xFFF4FF52L,
            textMuted = 0xFF878A38L,
            border = 0xFF706B3BL,
        ),
        PaldoraRoomPreset(
            id = "minimal_editorial",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFF7F5F0L,
            surface = 0xFFFFFFFFL,
            text = 0xFF151515L,
            textMuted = 0xFF6D6C6AL,
            border = 0xFF898989L,
        ),
        PaldoraRoomPreset(
            id = "polaroid_scrapbook",
            scheme = PaldoraRoomScheme.LIGHT,
            canvas = 0xFFEEE3CCL,
            surface = 0xFFFFFDF8L,
            text = 0xFF292118L,
            textMuted = 0xFF696053L,
            border = 0xFF827C75L,
        ),
    )

    val accents: List<PaldoraRoomAccent> = listOf(
        PaldoraRoomAccent("gold", 0xFF8C5F1AL, 0xFFC4933FL),
        PaldoraRoomAccent("lavender", 0xFF7F51B5L, 0xFFA281CAL),
        PaldoraRoomAccent("ocean", 0xFF127282L, 0xFF7FA4D8L),
        PaldoraRoomAccent("daisy", 0xFF915D0FL, 0xFFDB8D16L),
        PaldoraRoomAccent("pink", 0xFFAF398AL, 0xFFDC49FFL),
        PaldoraRoomAccent("emerald", 0xFF267647L, 0xFF34A362L),
        PaldoraRoomAccent("cyan", 0xFF007287L, 0xFF00E5FFL),
        PaldoraRoomAccent("crimson", 0xFFA23C2DL, 0xFFD57566L),
    )

    val fonts: List<PaldoraRoomFont> = listOf(
        PaldoraRoomFont("editorial", listOf("Newsreader", "Iowan Old Style", "Georgia", "serif")),
        PaldoraRoomFont("modern", listOf("Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif")),
        PaldoraRoomFont("rounded", listOf("ui-rounded", "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "sans-serif")),
        PaldoraRoomFont("mono", listOf("ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace")),
        PaldoraRoomFont("handwritten", listOf("Bradley Hand", "Segoe Print", "Noteworthy", "cursive")),
    )
}
