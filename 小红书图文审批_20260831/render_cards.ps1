Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSCommandPath
$W = 1080; $H = 1440
$ink = [System.Drawing.ColorTranslator]::FromHtml('#121212')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#F4EFE6')
$red = [System.Drawing.ColorTranslator]::FromHtml('#A30F22')
$gray = [System.Drawing.ColorTranslator]::FromHtml('#645E56')

function New-Page([System.Drawing.Color]$color) {
  $bmp = [System.Drawing.Bitmap]::new($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($color)
  return @($bmp,$g)
}
function Font([float]$size,[bool]$bold=$false,[string]$name='Microsoft YaHei') {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  return [System.Drawing.Font]::new($name,$size,$style,[System.Drawing.GraphicsUnit]::Pixel)
}
function Txt($g,[string]$text,[float]$x,[float]$y,[float]$w,[float]$h,[float]$size,[System.Drawing.Color]$color,[bool]$bold=$false,[string]$align='Near') {
  $f = Font $size $bold
  $brush = [System.Drawing.SolidBrush]::new($color)
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::$align
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Near
  $fmt.Trimming = [System.Drawing.StringTrimming]::Word
  $fmt.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
  $g.DrawString($text,$f,$brush,[System.Drawing.RectangleF]::new($x,$y,$w,$h),$fmt)
  $fmt.Dispose(); $brush.Dispose(); $f.Dispose()
}
function Box($g,[float]$x,[float]$y,[float]$w,[float]$h,[System.Drawing.Color]$color) {
  $brush = [System.Drawing.SolidBrush]::new($color); $g.FillRectangle($brush,$x,$y,$w,$h); $brush.Dispose()
}
function Rule($g,[float]$x,[float]$y,[float]$w,[System.Drawing.Color]$color,[float]$thick=3) {
  $pen = [System.Drawing.Pen]::new($color,$thick); $g.DrawLine($pen,$x,$y,$x+$w,$y); $pen.Dispose()
}
function Export($bmp,[string]$name) { $bmp.Save((Join-Path $root $name),[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }

# 01 cover: generated editorial photography plus controlled typography
$page = New-Page $ink; $bmp=$page[0]; $g=$page[1]
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'images/书桌视觉原图.png'))
$g.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,$W,$H)); $source.Dispose()
$overlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(160,0,0,0)); $g.FillRectangle($overlay,0,0,760,$H); $overlay.Dispose()
$overlay2 = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80,0,0,0)); $g.FillRectangle($overlay2,0,0,$W,500); $overlay2.Dispose()
Txt $g 'AI FOUNDER OS / 001' 76 88 720 40 22 $paper $false
Txt $g '一个人，' 76 305 690 130 102 $paper $true
Txt $g '不是一支队伍。' 76 430 690 220 102 $red $true
Txt $g "AI 时代真正的杠杆，是把执行交给系统，`n把判断留给自己。" 80 700 600 120 30 $paper $false
$pen=[System.Drawing.Pen]::new($paper,2); $g.DrawRectangle($pen,76,1200,148,52); $pen.Dispose(); Txt $g '超级个体' 91 1214 120 30 19 $paper $false
$pen=[System.Drawing.Pen]::new($paper,2); $g.DrawRectangle($pen,244,1200,148,52); $pen.Dispose(); Txt $g '建议收藏' 259 1214 120 30 19 $paper $false
Txt $g '01 / 04' 830 1325 170 35 22 $paper $false 'Far'; $g.Dispose(); Export $bmp '01_封面.png'

# 02 perspective card
$page = New-Page $paper; $bmp=$page[0]; $g=$page[1]
Txt $g 'THE SHIFT / 01' 76 86 500 36 22 $red $false 'Near'
Txt $g '别把自己，' 76 180 820 100 66 $ink $true
Txt $g '训练成 AI 的操作员。' 76 268 900 100 66 $ink $true
Rule $g 76 400 928 $ink 3
Txt $g "复制、粘贴、反复追问，并没有替你创造杠杆。`n它只是把旧的忙碌，换成了新的忙碌。" 76 435 850 105 27 $gray $false
Box $g 76 600 840 310 $ink; Box $g 820 818 135 135 $red
Txt $g '“' 122 632 90 90 98 $red $true 'Center'
Txt $g "你的时间比 Token 贵。`n别替 AI 干脏活。" 130 720 680 125 41 $paper $true
Rule $g 76 1012 420 ([System.Drawing.ColorTranslator]::FromHtml('#AAA299')) 7
Rule $g 584 1012 420 $ink 7
Txt $g 'OLD MODE' 76 1040 300 30 20 $gray $false
Txt $g '你负责执行' 76 1083 380 50 35 $ink $true
Txt $g '找资料、写初稿、改格式、追进度。' 76 1148 400 75 23 $gray $false
Txt $g 'NEW MODE' 584 1040 300 30 20 $red $false
Txt $g '你负责判断' 584 1083 380 50 35 $ink $true
Txt $g '方向、标准、审美；系统负责重复执行。' 584 1148 420 78 23 $gray $false
Txt $g '02 / 04' 830 1325 170 35 22 $ink $false 'Far'; $g.Dispose(); Export $bmp '02_观点.png'

# 03 visual workflow grid
$page = New-Page $paper; $bmp=$page[0]; $g=$page[1]
Txt $g 'THE LOOP / 02' 76 86 500 36 22 $red $false
Txt $g '一个人公司的' 76 180 820 95 66 $ink $true
Txt $g '4 个运转环节' 76 270 820 95 66 $ink $true
Txt $g '不是多装几个工具，而是让每一步都有清楚的输入、产出和验收。' 76 392 900 44 26 $gray $false
$cards = @(
  @{x=76;y=510;bg=[System.Drawing.ColorTranslator]::FromHtml('#E8E1D5');n='01';t='捕捉';d="灵感、问题、用户反馈，`n不必先写成完美 PRD。";fg=$ink},
  @{x=560;y=510;bg=$ink;n='02';t='调研';d="找对标、查证来源、拆解模式，`n先把感觉变成证据。";fg=$paper},
  @{x=76;y=828;bg=$ink;n='03';t='交付';d="把文案、图文、原型做成`n可审查的成品。";fg=$paper},
  @{x=560;y=828;bg=[System.Drawing.ColorTranslator]::FromHtml('#E8E1D5');n='04';t='复盘';d="看点击、收藏、评论，`n沉淀下一次的标准。";fg=$ink}
)
foreach($c in $cards) { Box $g $c.x $c.y 444 288 $c.bg; Txt $g $c.n ($c.x+28) ($c.y+28) 100 55 48 $red $true; Txt $g $c.t ($c.x+28) ($c.y+112) 270 55 36 $c.fg $true; Txt $g $c.d ($c.x+28) ($c.y+180) 350 75 22 $c.fg $false; $b=[System.Drawing.SolidBrush]::new($red); $g.FillEllipse($b,$c.x+372,$c.y+219,42,42); $b.Dispose() }
Txt $g '03 / 04' 830 1325 170 35 22 $ink $false 'Far'; $g.Dispose(); Export $bmp '03_工作流.png'

# 04 closing / CTA — reuses the cover's desk photograph so the carousel closes in the same visual world.
$page = New-Page $ink; $bmp=$page[0]; $g=$page[1]
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'images/书桌视觉原图.png'))
$g.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,$W,$H)); $source.Dispose()
$overlay=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(115,0,0,0)); $g.FillRectangle($overlay,0,0,$W,$H); $overlay.Dispose()
$overlay2=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90,0,0,0)); $g.FillRectangle($overlay2,0,0,760,$H); $overlay2.Dispose()
$overlay3=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(110,0,0,0)); $g.FillRectangle($overlay3,0,900,650,540); $overlay3.Dispose()
$accent=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(215,163,15,34)); $g.FillRectangle($accent,76,570,10,230); $accent.Dispose()
Txt $g 'THE DECISION / 04' 76 88 500 36 22 $paper $false
Txt $g '把判断' 76 230 660 106 78 $paper $true
Txt $g '留给自己。' 76 328 740 108 78 $paper $true
Txt $g '让系统，替你跑执行。' 76 448 850 74 46 $red $true
Rule $g 76 565 240 $paper 2
Txt $g "最耗时、最重复、`n最不需要你亲自判断的事，`n才是最值得先交出去的事。" 114 600 750 180 33 $paper $false
Txt $g 'FROM ONE TASK TO A SYSTEM' 76 990 470 28 18 $paper $false
$pen=[System.Drawing.Pen]::new($paper,2); $g.DrawRectangle($pen,76,1036,438,70); $pen.Dispose()
Txt $g '从一件重复工作开始' 104 1051 340 48 26 $paper $true
Txt $g '↓  收藏这一页，留给下一次重读' 76 1160 600 36 25 $paper $false
Txt $g 'AI 辅助创作 · 书斋 / AI Founder OS' 76 1323 600 28 18 ([System.Drawing.ColorTranslator]::FromHtml('#D0C8BD')) $false
Txt $g '04 / 04' 830 1325 170 35 22 $paper $false 'Far'; $g.Dispose(); Export $bmp '04_收尾.png'
