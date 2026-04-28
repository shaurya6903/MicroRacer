'use strict';

let HUDButtons = [];
let radioMusic = -1;

function initHUD()
{
    // Car selection buttons
    for(let i=5; i--;)
    {
        let b = new HUDButton('CAR '+(i+1), vec3(.2+i*.15,.3), vec3(.1,.08), o=>{
            selectedCarIndex = i;
            playerVehicle.modelIndex = selectedCarIndex;
        }, hsl(.6, .8, .5));
        HUDButtons.push(b);
    }
}

// Draws a bold rounded-rect card matching the game's existing card aesthetic
function drawCard(ctx, x, y, w, h, r, bgColor, borderColor, borderWidth=0, hardShadow=false)
{
    if (hardShadow) {
        ctx.save();
        ctx.beginPath();
        const sx = x + Math.max(4, w * 0.04);
        const sy = y + Math.max(4, h * 0.08);
        ctx.moveTo(sx + r, sy);
        ctx.lineTo(sx + w - r, sy);
        ctx.arcTo(sx + w, sy,     sx + w, sy + r,     r);
        ctx.lineTo(sx + w, sy + h - r);
        ctx.arcTo(sx + w, sy + h, sx + w - r, sy + h, r);
        ctx.lineTo(sx + r, sy + h);
        ctx.arcTo(sx,     sy + h, sx,     sy + h - r, r);
        ctx.lineTo(sx,     sy + r);
        ctx.arcTo(sx,     sy,     sx + r, sy,         r);
        ctx.closePath();
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();
    if (borderWidth > 0)
    {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = borderWidth;
        ctx.stroke();
    }
    ctx.restore();
}

function drawHUD()
{
    // Draw car selection buttons if on menu or attract mode
    if (attractMode)
    {
        for(const b of HUDButtons)
            b.draw();
    }

    const ctx = mainContext;
    const W   = mainCanvasSize.x;
    const H   = mainCanvasSize.y;

    // === COUNTDOWN ===
    if (startCountdownTimer.active() || startCountdown > 0)
    {
        if (startCountdown < 4)
        {
            const a  = 1 - time % 1;
            let t    = startCountdown | 0;
            if (startCountdown == 0 && startCountdownTimer.active()) t = 'GO!';

            const isGo = t === 'GO!';
            const cx   = W * .5;
            const cy   = H * .35;
            const sz   = H * (.18 - a * .03);
            const cw   = sz * 1.6;
            const ch   = sz * 1.3;

            // Card background
            ctx.save();
            ctx.globalAlpha = a * .92;
            drawCard(ctx, cx - cw/2, cy - ch/2, cw, ch, H * .028,
                isGo ? '#39ff14' : '#ff007f', // neon green or hot pink
                '#000000',
                Math.max(2, H * .008),
                true
            );
            ctx.restore();

            // Number / GO
            ctx.save();
            ctx.globalAlpha   = a;
            ctx.font          = `900 italic ${sz * .88}px 'Arial Black', Arial`;
            ctx.textAlign     = 'center';
            ctx.textBaseline  = 'middle';
            ctx.fillStyle     = '#000000';
            ctx.fillText(t, cx, cy);
            ctx.restore();
        }
    }
    else if (gameOverTimer.isSet())
    {
        const pulse = Math.abs(Math.sin(time * 2.5));
        const sz    = H * (.075 + pulse * .008);
        const cx    = W * .5;
        const cy    = H * .35;
        const cw    = sz * 6.5;
        const ch    = sz * 1.6;

        ctx.save();
        drawCard(ctx, cx - cw/2, cy - ch/2, cw, ch, H * .025,
            '#ffea00', '#000000', Math.max(2, H * .008), true);
        ctx.restore();

        ctx.save();
        ctx.font          = `900 italic ${sz}px 'Arial Black', Arial`;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillStyle     = '#000000';
        ctx.fillText('GAME OVER', cx, cy);
        ctx.restore();
    }

    // === LEFT-SIDE HUD + SPEEDOMETER ===
    const aspect = mainCanvasSize.x / mainCanvasSize.y;
    if (aspect > .75)
    {
        const mph        = playerVehicle.velocity.z | 0;
        const maxSpeed   = 200;
        const speedRatio = Math.min(Math.abs(mph) / maxSpeed, 1);

        // Card sizing — matches the proportions in the screenshot
        const cardX   = H * .045;   // left margin
        const cardW   = H * .285;   // card width
        const cardH   = H * .095;   // card height
        const cardR   = H * .026;   // corner radius
        const cardGap = H * .016;   // gap between cards
        const labelSz = H * .021;
        const valueSz = H * .040;

        let cardY = H * .05;

        // ── MODE card — yellow, bold, just like in the screenshot ──
        drawCard(ctx, cardX, cardY, cardW, cardH, cardR,
            '#ffea00', '#000000', Math.max(2, H * .008), true);

        ctx.save();
        ctx.font          = `900 ${labelSz}px 'Arial Black', Arial`;
        ctx.textAlign     = 'left';
        ctx.textBaseline  = 'top';
        ctx.fillStyle     = '#000000';
        ctx.fillText('MODE', cardX + H * .02, cardY + H * .014);
        ctx.restore();

        ctx.save();
        ctx.font          = `900 italic ${valueSz}px 'Arial Black', Arial`;
        ctx.textAlign     = 'left';
        ctx.textBaseline  = 'top';
        ctx.fillStyle     = '#000000';
        ctx.fillText('3D WORLD', cardX + H * .02, cardY + H * .040);
        ctx.restore();

        cardY += cardH + cardGap;

        // ── ANALOG SPEEDOMETER — positioned towards the bottom of the screen ────────
        const cx = cardX + cardW / 2;
        const cy = H * 0.8;
        const R  = H * .108;           // slightly smaller radius to stay on screen
        const hardShadow = Math.max(4, H * .01);

        // Outer bezel + background with hard shadow
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx + hardShadow, cy + hardShadow, R * 1.22, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
        ctx.fillStyle = '#111111';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = Math.max(2, H * .008);
        ctx.stroke();
        ctx.restore();

        // Face
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
        ctx.fillStyle = '#161616';
        ctx.fill();
        ctx.restore();

        // Tick marks
        const startAngle  = 210 * Math.PI / 180;
        const endAngle    = 480 * Math.PI / 180; // 210 + 270
        const needleAngle = startAngle + speedRatio * (endAngle - startAngle);
        const totalTicks  = 27;

        for (let i = 0; i <= totalTicks; i++)
        {
            const a       = startAngle + (i / totalTicks) * (endAngle - startAngle);
            const isMajor = i % 3 === 0;
            const redZone = i / totalTicks > .75;
            const innerR  = R * (isMajor ? .68 : .82);
            const outerR  = R * .97;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
            ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
            ctx.strokeStyle = redZone
                ? (isMajor ? '#ff007f' : '#660033')
                : (isMajor ? '#ffffff' : '#666666');
            ctx.lineWidth   = isMajor ? Math.max(2, H * .008) : Math.max(1, H * .004);
            ctx.lineCap     = 'round';
            ctx.stroke();
            ctx.restore();

            if (isMajor)
            {
                const labelR     = R * .54;
                const labelSpeed = Math.round((i / totalTicks) * maxSpeed / 10) * 10;
                ctx.save();
                ctx.font          = `900 ${H * .022}px 'Arial Black', Arial`;
                ctx.fillStyle     = redZone ? '#ff007f' : '#dddddd';
                ctx.textAlign     = 'center';
                ctx.textBaseline  = 'middle';
                ctx.fillText(labelSpeed, cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR);
                ctx.restore();
            }
        }

        // Speed arc — neon cyan
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * .87, startAngle, needleAngle);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth   = Math.max(2, H * .015);
        ctx.lineCap     = 'round';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur  = 18;
        ctx.stroke();
        ctx.restore();

        // Dead arc (remaining track)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * .87, needleAngle, endAngle);
        ctx.strokeStyle = '#222222';
        ctx.lineWidth   = Math.max(2, H * .015);
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.restore();

        // Needle
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);
        ctx.beginPath();
        ctx.moveTo(-R * .12, 0);
        ctx.lineTo(R * .85, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = Math.max(2, H * .008);
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.restore();

        // Center cap
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * .1, 0, Math.PI * 2);
        ctx.fillStyle   = '#000000';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = Math.max(2, H * .005);
        ctx.stroke();
        ctx.restore();

        // Digital speed readout
        ctx.save();
        ctx.font          = `900 italic ${H * .072}px 'Arial Black', Arial`;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillStyle     = '#ffffff';
        ctx.fillText(Math.abs(mph), cx, cy);
        ctx.restore();

        // KM/H label
        ctx.save();
        ctx.font          = `900 ${H * .021}px 'Arial Black', Arial`;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillStyle     = '#00e5ff';
        ctx.fillText('KM/H', cx, cy + R * .42);
        ctx.restore();
    }
}

class HUDButton
{
    constructor(text, pos, size, onClick, color=WHITE, backgroundColor=hsl(.6,1,.2))
    {
        this.text            = text;
        this.pos             = pos;
        this.size            = size;
        this.onClick         = onClick;
        this.color           = color;
        this.backgroundColor = backgroundColor;
    }

    draw()
    {
        let pos             = this.pos.copy();
        let backgroundColor = this.backgroundColor;
        let color           = this.color;
        let outlineColor    = WHITE;

        if (this.musicTrack == radioMusic)
        {
            backgroundColor = hsl(radioMusic < 0 ? 0 : .1, 1, .5);
            color           = WHITE;
            outlineColor    = BLACK;
        }

        backgroundColor && drawHUDRect(pos, this.size, backgroundColor, .005, outlineColor);

        pos.y += this.size.y * .05;
        drawHUDText(this.text, pos, this.size.y * .8, color, .005, undefined, undefined, undefined, 900, undefined, this.size.x * .75);

        {
            pos        = HUDstickToSides(pos);
            const size = this.size.scale(mainCanvasSize.y);
            const p1   = pos.multiply(mainCanvasSize);
            const p2   = mousePos.multiply(mainCanvasSize);
            if (this.onClick && mouseWasPressed(0))
                if (isOverlapping(p1, size, p2))
                    this.onClick();
        }
    }
}

function HUDstickToSides(pos)
{
    pos = pos.copy();
    if (pos.x < .5)
        pos.x = pos.x * mainCanvasSize.y / mainCanvasSize.x;
    else
        pos.x = 1 - (1 - pos.x) * mainCanvasSize.y / mainCanvasSize.x;
    return pos;
}

///////////////////////////////////////////////////////////////////////////////

function drawHUDRect(pos, size, color=WHITE, lineWidth=0, lineColor=BLACK)
{
    pos = HUDstickToSides(pos);

    lineWidth *= mainCanvasSize.y;
    size       = size.scale(mainCanvasSize.y);
    pos        = pos.multiply(mainCanvasSize).subtract(size.scale(.5));

    const context       = mainContext;
    context.fillStyle   = color;
    context.strokeStyle = lineColor;
    context.lineWidth   = lineWidth;
    context.fillRect(pos.x, pos.y, size.x, size.y);
    lineWidth && context.strokeRect(pos.x, pos.y, size.x, size.y);
}

function drawHUDText(text, pos, size=.1, color=WHITE, shadowOffset=0, shadowColor=BLACK, font='arial', textAlign='center', weight=400, style='', width, stickToSides=1)
{
    if (stickToSides)
        pos = HUDstickToSides(pos);

    size *= mainCanvasSize.y;
    if (width)
        width *= mainCanvasSize.y;
    shadowOffset *= mainCanvasSize.y;
    pos = pos.multiply(mainCanvasSize);

    const context        = mainContext;
    context.font         = style + ' ' + weight + ' ' + size + 'px ' + font;
    context.textBaseline = 'middle';
    context.textAlign    = textAlign;

    if (shadowOffset)
    {
        let c = shadowColor.copy();
        c.a   = color.a;
        context.fillStyle = c;
        context.fillText(text, pos.x + shadowOffset, pos.y + shadowOffset, width);
    }

    context.fillStyle = color;
    context.fillText(text, pos.x, pos.y, width);
}