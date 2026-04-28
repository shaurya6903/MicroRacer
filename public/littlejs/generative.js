'use strict';

let generativeCanvas, generativeContext;

const generativeTileSize = 256;
const generativeCanvasSize = vec3(generativeTileSize*8,generativeTileSize*8,1);
const generativeTileSizeVec3 = vec3(generativeTileSize,generativeTileSize,0);

function initGenerative()
{
    generativeCanvas = document.createElement('canvas');
    generativeContext = generativeCanvas.getContext('2d');
    generativeCanvas.width  = generativeCanvasSize.x;
    generativeCanvas.height = generativeCanvasSize.y;
    generateTetures();

    glActiveTexture = glCreateTexture(generativeCanvas);
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture);
}

function generateTetures()
{
    const context = generativeContext;
    random.setSeed(13);

    // ─────────────────────────────────────────────────────────────────────────
    // PARTICLE CLASS  (identical to original)
    // ─────────────────────────────────────────────────────────────────────────
    class Particle
    {
        constructor(x, y, vx, vy, accel, sizeStart=.1, sizeEnd=0, c=BLACK)
        {
            this.x         = x;
            this.y         = y;
            this.vx        = vx;
            this.vy        = vy;
            this.accel     = accel;
            this.sizeStart = sizeStart;
            this.sizeEnd   = sizeEnd;
            this.color     = c;
            this.style     = 0;
            this.colorRandom = 0;
            this.iterations  = 50;
        }

        draw()
        {
            for(let i = this.iterations|0; i-- > 0;)
            {
                if(this.color)
                    color(random.mutateColor(this.color, this.colorRandom));
                const p  = i / this.iterations;
                const x1 = this.x + this.vx * p;
                const y1 = this.y + this.vy * p + this.accel * p * p;
                let s;
                if(this.style)
                    s = Math.sin(p*PI)*(this.sizeStart-this.sizeEnd) + this.sizeEnd;
                else
                    s = lerp(p, this.sizeStart, this.sizeEnd);
                rect(x1, y1, s, s);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TILE LAYOUT
    // ─────────────────────────────────────────────────────────────────────────
    {
        // ROW 0
        color(hsl(0,0,1));
        setupContext(0,0);  circle(.5,.5,.45);

        setupContext(1,0);
        for(let i=40;i--;)
            color(hsl(0,0,1,i/300)),
            circle(.5,.5,.5-i/80);

        setupContext(2,0);
        for(let i=40,a;i--;)
        {
            color(hsl(0,0,1,a=i/40));
            rect(.5,.5,.5-a/3,.9-a/3);
        }

        setupContext(3,0);  drawLicensePlate();
        setupContext(4,0);  drawRoadTile();
        setupContext(5,0);  drawStartSign();
        setupContext(6,0);  drawCheckpointSign();
        setupContext(7,0);  drawCheckpointSign(1);

        // ROW 1: plants + ground
        setupContext(0,1);  drawPalmTree();
        setupContext(1,1);  drawGrass();
        setupContext(2,1);  drawSpruceTree();
        setupContext(3,1);  drawGroundTile();

        // ROW 2: signs
        setupContext(0,2);  drawBounceBackSign();
        setupContext(1,2);  drawBounceBackSign();
        setupContext(2,2);  drawGenericSign('GitHub',.3,BLACK,WHITE);
        setupContext(3,2);  drawLittleJSSign();
        setupContext(4,2);  drawHarrisSign();
        setupContext(5,2);  drawGenericSign('VOTE',.4,BLACK,WHITE);
        setupContext(6,2);  drawDwitterSign('dwitter.net',.3,BLACK,WHITE,'courier new');
        setupContext(7,2);  drawAvalancheSign();

        // ROW 3
        setupContext(0,3);  drawZZFXSign();
    }

    // Hard-alpha pass (rows 1+)
    {
        const w = generativeCanvas.width, h = generativeCanvas.height;
        const imageData = context.getImageData(0, generativeTileSize, w, h);
        const data = imageData.data;
        for(let i = 3; i < data.length; i += 4)
            data[i] = data[i] < 128 ? 0 : 255;
        context.putImageData(imageData, 0, generativeTileSize);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function setupContext(x, y)
    {
        const w = generativeTileSize;
        context.restore();
        context.save();
        context.setTransform(w,0,0,w,w*x,w*y);
        context.beginPath();
        context.rect(0,0,1,1);
        context.clip();
    }

    function particle(...a)              { return new Particle(...a); }
    function circle(x,y,r)              { ellipse(x,y,r,r); }
    function rect(x=.5,y=.5,w=1,h=1)   { context.fillRect(x-w/2,y-h/2,w,h); }
    function rectOutline(x=.5,y=.5,w=1,h=1,l=.05)
                                        { context.lineWidth=l; context.strokeRect(x-w/2,y-h/2,w,h); }
    function color(c=WHITE)             { context.fillStyle   = c; }
    function lineColor(c=WHITE)         { context.strokeStyle = c; }

    function linearGradient(x1,y1,x2,y2,c1,c2=WHITE)
    {
        const g = context.createLinearGradient(x1,y1,x2,y2);
        g.addColorStop(0,c1); g.addColorStop(1,c2); color(g);
    }

    function radialGradient(x,y,r1,r2,c1,c2=WHITE)
    {
        const g = context.createRadialGradient(x,y,r1,x,y,r2);
        g.addColorStop(0,c1); g.addColorStop(1,c2); color(g);
    }

    function ellipse(x=.5,y=.5,w=.5,h=.5,a=0)
    {
        context.beginPath();
        context.ellipse(x,y,max(0,w),max(0,h),a,0,9);
        context.fill();
    }

    function line(x1,y1,x2,y2,w=.1)
    {
        context.lineWidth=w;
        context.beginPath();
        context.lineTo(x1,y1);
        context.lineTo(x2,y2);
        context.stroke();
    }

    function polygon(sides=3,x=.5,y=.5,r=.5,ao=0)
    {
        context.beginPath();
        for(let i=sides;i--;)
        {
            const a = i/sides*PI*2;
            context.lineTo(x+r*Math.sin(a+ao),y-r*Math.cos(a+ao));
        }
        context.fill();
    }

    function text(s,x=.5,y=.5,size=1,width=.95,lineWidth=0,font='arial',textAlign='center',weight=400,style='')
    {
        context.lineWidth    = lineWidth;
        context.font         = style+' '+weight+' '+size+'px '+font;
        context.textBaseline = 'middle';
        context.textAlign    = textAlign;
        context.lineJoin     = 'round';
        context.fillText(s,x,y,width);
        lineWidth && context.strokeText(s,x,y,width);
    }

    // Helper: work in raw pixel space for sub-pixel detail
    function withPixelSpace(fn)
    {
        context.save();
        const tf = context.getTransform();
        context.setTransform(generativeTileSize,0,0,generativeTileSize,tf.e,tf.f);
        fn();
        context.restore();
    }

    // =========================================================================
    // ULTRA-REALISTIC ROAD TILE
    // =========================================================================
    function drawRoadTile()
    {
        // 1. Base asphalt — dark warm-grey, slight side-to-side gradient
        linearGradient(0,0,1,0, hsl(.04,.06,.152), hsl(.04,.04,.202));
        rect();

        withPixelSpace(() => {
            // 2. Coarse aggregate stones
            for(let i = 2000; i--;)
            {
                let px  = random.float();
                let py  = random.float();
                let sw  = random.float(.002,.013);
                let sh  = sw * random.float(.35,2.2);
                let lit = random.float(.15,.37);
                context.fillStyle = hsl(random.float(.04,.15), random.float(0,.10), lit);
                context.fillRect(px-sw/2, py-sh/2, sw, sh);
            }

            // 3. Fine dust overlay
            for(let i = 700; i--;)
            {
                let px = random.float();
                let py = random.float();
                let s  = random.float(.0008,.004);
                context.fillStyle = hsl(.06,.05,random.float(.23,.37));
                context.fillRect(px,py,s,s);
            }

            // 4. Oil stains near centre
            for(let i = 8; i--;)
            {
                let cx = random.float(.22,.78);
                let cy = random.float(.10,.90);
                let rx = random.float(.015,.055);
                let ry = rx * random.float(.22,.55);
                const g = context.createRadialGradient(cx,cy,0,cx,cy,rx);
                g.addColorStop(0,  hsl(.22,.32,.08));
                g.addColorStop(.55,hsl(.20,.18,.10));
                g.addColorStop(1,  hsl(0,0,0,0));
                context.fillStyle = g;
                context.beginPath();
                context.ellipse(cx,cy,rx,ry,random.float(0,PI),0,9);
                context.fill();
            }

            // 5. Cracks — multi-segment jagged hairlines
            for(let i = 32; i--;)
            {
                let cx = random.float(.07,.93);
                let cy = random.float(.03,.97);
                context.strokeStyle = hsl(0,0,random.float(.05,.10));
                context.lineWidth   = random.float(.0007,.0032);
                context.lineCap     = 'round';
                context.beginPath();
                context.moveTo(cx,cy);
                let nx=cx, ny=cy;
                for(let s = random.int(3,9); s--;)
                {
                    nx = Math.max(0,Math.min(1, nx+random.floatSign(.055)));
                    ny = Math.max(0,Math.min(1, ny+random.floatSign(.038)));
                    context.lineTo(nx,ny);
                }
                context.stroke();
            }

            // 6. Pothole depressions
            for(let i = 6; i--;)
            {
                let px = random.float(.12,.88);
                let py = random.float(.10,.90);
                let rx = random.float(.009,.026);
                context.fillStyle = hsl(.05,.08,.11);
                context.beginPath();
                context.ellipse(px,py,rx,rx*random.float(.5,.9),random.float(0,PI),0,9);
                context.fill();
                context.strokeStyle = hsl(0,0,.06);
                context.lineWidth   = random.float(.002,.005);
                context.stroke();
            }
        });

        // 7. Tyre-track dark bands — two lanes, two wheel paths each
        for(let lane = 0; lane < 2; lane++)
        {
            let lx = .28 + lane*.44;
            for(let w = 0; w < 2; w++)
            {
                let x = lx + (w===0 ? -.050 : .050);
                const g = context.createLinearGradient(x-.065,0,x+.065,0);
                g.addColorStop(0,   hsl(0,0,0,0));
                g.addColorStop(.38, hsl(0,0,.082));
                g.addColorStop(.62, hsl(0,0,.082));
                g.addColorStop(1,   hsl(0,0,0,0));
                color(g);
                rect(x,.5,.13,1);
            }
        }

        // 8. Concrete curb shoulders
        linearGradient(0,0,.09,0, hsl(.06,.08,.48),hsl(.06,.06,.34));
        rect(.034,.5,.068,1);
        linearGradient(.91,0,1,0, hsl(.06,.06,.34),hsl(.06,.08,.48));
        rect(.966,.5,.068,1);

        // 9. Yellow rumble strips
        for(let i = 14; i--;)
        {
            let y = i/14;
            color(i%2===0 ? hsl(.13,.92,.52) : hsl(.13,.86,.43));
            rect(.052, y+.036, .040, .080);
            rect(.948, y+.036, .040, .080);
        }

        // 10. Dashed centre lane markings — worn white
        for(let i = 6; i--;)
        {
            let y  = i*.185 + .024;
            // Shadow edge
            color(hsl(0,0,.55));
            rect(.500, y+.053, .037, .088);
            // Main marking
            color(hsl(0,0,.87));
            rect(.500, y+.050, .034, .082);
            // Worn bright centre
            color(hsl(0,0,.95));
            rect(.500, y+.050, .015, .028);
        }

        // 11. Wet-gloss specular sheen
        const gloss = context.createLinearGradient(.28,0,.72,0);
        gloss.addColorStop(0,   hsl(0,0,0,0));
        gloss.addColorStop(.42, hsl(0,0,1,.052));
        gloss.addColorStop(.58, hsl(0,0,1,.052));
        gloss.addColorStop(1,   hsl(0,0,0,0));
        color(gloss);
        rect();

        // 12. Edge vignette for seamless tiling
        const vig = context.createRadialGradient(.5,.5,.18,.5,.5,.74);
        vig.addColorStop(0, hsl(0,0,0,0));
        vig.addColorStop(1, hsl(0,0,0,.20));
        color(vig);
        rect();
    }

    // =========================================================================
    // ULTRA-REALISTIC GROUND / EARTH TILE
    // =========================================================================
    function drawGroundTile()
    {
        // 1. Base soil gradient
        linearGradient(0,0,0,1, hsl(.09,.52,.265), hsl(.10,.58,.178));
        rect();

        // 2. Large clay / loam blotches
        for(let i = 95; i--;)
        {
            let x   = random.float();
            let y   = random.float();
            let rx  = random.float(.022,.115);
            let ry  = rx * random.float(.28,.88);
            color(hsl(random.float(.06,.14), random.float(.32,.68), random.float(.13,.33)));
            ellipse(x,y,rx,ry,random.float(0,PI));
        }

        withPixelSpace(() => {
            // 3. Fine-grain texture noise
            for(let i = 2600; i--;)
            {
                let px  = random.float();
                let py  = random.float();
                let s   = random.float(.0007,.0042);
                context.fillStyle = hsl(random.float(.07,.13),random.float(.2,.58),random.float(.14,.42));
                context.fillRect(px,py,s,s);
            }

            // 4. Root / desiccation crack lines
            for(let i = 26; i--;)
            {
                let rx = random.float(.04,.96);
                let ry = random.float(.04,.96);
                context.strokeStyle = hsl(.09,.40,random.float(.09,.15));
                context.lineWidth   = random.float(.0006,.0022);
                context.lineCap     = 'round';
                context.beginPath();
                context.moveTo(rx,ry);
                let nx=rx, ny=ry;
                for(let s = random.int(2,6); s--;)
                {
                    nx = Math.max(0,Math.min(1, nx+random.floatSign(.062)));
                    ny = Math.max(0,Math.min(1, ny+random.floatSign(.046)));
                    context.lineTo(nx,ny);
                }
                context.stroke();
            }
        });

        // 5. Embedded pebbles / rocks with AO shadow + specular
        for(let i = 70; i--;)
        {
            let px  = random.float(.01,.99);
            let py  = random.float(.01,.99);
            let rx  = random.float(.005,.025);
            let ry  = rx * random.float(.55,1.12);
            let hue = random.float(.04,.15);
            let lit = random.float(.25,.55);
            // Stone body
            color(hsl(hue,.16,lit));
            ellipse(px,py,rx,ry,random.float(0,PI));
            // AO shadow under stone
            color(hsl(hue,.10,lit*.40));
            ellipse(px+rx*.18,py+ry*.24,rx*.72,ry*.26);
            // Specular highlight
            color(hsl(0,0,lit+.30));
            ellipse(px-rx*.28,py-ry*.28,rx*.36,ry*.24);
        }

        // 6. Dead leaf / organic debris
        for(let i = 40; i--;)
        {
            let px  = random.float(.01,.99);
            let py  = random.float(.01,.99);
            let rx  = random.float(.007,.022);
            let ry  = rx * random.float(.24,.55);
            let hue = random.float(.06,.14);
            let lit = random.float(.22,.40);
            color(hsl(hue,.55,lit));
            ellipse(px,py,rx,ry,random.float(0,PI));
        }

        // 7. Dry grass / weed tufts scattered on soil
        for(let i = 120; i--;)
        {
            let x    = random.float(.02,.98);
            let y    = random.float(.05,.98);
            let h    = random.float(.030,.092);
            let lean = random.floatSign(.048);
            let hue  = random.float(.20,.34);
            let lit  = random.float(.24,.52);
            let p = particle(x,y, lean,-h, h*.22, random.float(.005,.013),.001);
            p.color       = hsl(hue, random.float(.38,.80), lit);
            p.colorRandom = .04;
            p.iterations  = 9;
            p.draw();
            // Root shadow
            color(hsl(.08,.52,.10));
            rect(x+lean*.1, y+.004, random.float(.007,.016), .005);
        }

        // 8. Moss / lichen patches
        for(let i = 22; i--;)
        {
            let x  = random.float(.02,.98);
            let y  = random.float(.02,.98);
            let rx = random.float(.010,.042);
            color(hsl(random.float(.28,.38),random.float(.38,.70),random.float(.20,.36)));
            ellipse(x,y,rx,rx*random.float(.4,.8),random.float(0,PI));
        }

        // 9. Top-light: brighter near top of tile
        linearGradient(0,0,0,.38, hsl(.10,.25,.44),hsl(0,0,0,0));
        rect(.5,.19,1,.38);

        // 10. AO vignette
        const v = context.createRadialGradient(.5,.5,.18,.5,.5,.76);
        v.addColorStop(0, hsl(0,0,0,0));
        v.addColorStop(1, hsl(.09,.30,.07));
        color(v);
        rect();
    }

    // =========================================================================
    // SPRUCE TREE  — proper conical silhouette, branch fringes, snow, star
    // =========================================================================
    function drawSpruceTree()
    {
        // Trunk with bark streaks
        color(hsl(.07,.50,.18));
        rect(.5,.88,.080,.26);
        color(hsl(.07,.30,.11));
        rect(.5,.90,.040,.22);
        for(let i = 7; i--;)
        {
            let bx = .5 + random.floatSign(.022);
            color(hsl(.08,.38,random.float(.08,.16)));
            rect(bx, random.float(.78,.96), .008, random.float(.04,.12));
        }

        const layers = 6;
        for(let layer = 0; layer < layers; layer++)
        {
            let t  = layer/(layers-1);      // 0=apex  1=base
            let cy = .150 + t*.620;
            let wr = .052 + t*.408;
            let th = .162 + t*.055;

            // Fill tier with horizontal strips — dark base, lighter tip
            const strips = 22;
            for(let s = strips; s--;)
            {
                let sp  = s/strips;
                let sw  = wr*(1-sp)*2;
                let sy  = cy - th*.5 + th*sp;
                let lit = .11 + sp*.19 + random.float(0,.052);
                color(hsl(.354,.74,lit));
                rect(.5,sy,sw,th/strips*1.28);
            }

            // Branch-tip needle fringes — drooping outward
            for(let b = 20; b--;)
            {
                let side = b%2===0 ? 1 : -1;
                let frac = random.float(.52,.94);
                let bx   = .5 + side*wr*frac;
                let by   = cy + th*random.float(.04,.44);
                let blen = wr*random.float(.055,.175);
                let p = particle(bx,by, side*blen*.88, random.float(.016,.058), .042, .011,.002);
                p.color       = hsl(.350,.68,random.float(.17,.33));
                p.colorRandom = .04;
                p.iterations  = 8;
                p.draw();
            }

            // Inner dark mass for volume
            color(hsl(.36,.55,.08));
            rect(.5, cy+th*.12, wr*.86, th*.52);

            // Snow mound on each tier
            color(hsl(.58,.08,.90));
            ellipse(.5, cy-th*.44, wr*.54*(1-t*.38), th*.072*(1-t*.16));
            // Bright snow highlight
            color(hsl(0,0,.97));
            rect(.5, cy-th*.46, wr*.30*(1-t*.28), th*.038);
        }

        // Pointed dark apex
        color(hsl(.35,.70,.13));
        polygon(3,.5,.075,.042);

        // Gold star with radial glow
        color(hsl(.14,1.0,.72));
        ellipse(.5,.072,.030,.030);
        color(hsl(.14,.55,.97));
        ellipse(.5,.072,.014,.014);
        withPixelSpace(() => {
            const g = context.createRadialGradient(.5,.072,0,.5,.072,.032);
            g.addColorStop(0, hsl(.14,1,.90));
            g.addColorStop(1, hsl(.14,1,0,0));
            context.fillStyle = g;
            context.fillRect(.5-.033,.072-.033,.066,.066);
        });
    }

    // =========================================================================
    // GRASS  — correct particle semantics: vx=lean, vy=-height, accel=bow
    // =========================================================================
    function drawGrass()
    {
        // Soil base dots
        for(let i = 62; i--;)
        {
            let x = .5 + random.floatSign(.44);
            color(hsl(.10,.44,random.float(.10,.20)));
            rect(x,1,random.float(.012,.042),random.float(.008,.026));
        }

        // Main blades: drawn from (x,1) upward by h, leaning by lean
        for(let i = 195; i--;)
        {
            let x    = .5 + random.floatSign(.42);
            let h    = random.float(.06,.21);
            let lean = random.floatSign(.11);
            let hue  = random.float(.24,.38);
            let sat  = random.float(.54,.92);
            let lit  = random.float(.19,.52);
            let w    = random.float(.008,.020);

            let p = particle(x,1, lean,-h, h*.26, w, w*.11);
            p.color       = hsl(hue,sat,lit);
            p.colorRandom = .03;
            p.iterations  = 12;
            p.draw();

            // Bright tip starting 65% up
            let tp = particle(x+lean*.65, 1-h*.65, lean*.22,-h*.30, 0, .0042,0);
            tp.color      = hsl(hue+.04,sat*.52,lit+.33);
            tp.iterations = 5;
            tp.draw();
        }

        // Foreground micro-tufts
        for(let i = 55; i--;)
        {
            let x = .5 + random.floatSign(.42);
            let p = particle(x,1, random.floatSign(.04),random.float(-.013,-.055), .009, .007,.001);
            p.color      = hsl(.30,.50,random.float(.09,.20));
            p.iterations = 5;
            p.draw();
        }
    }

    // =========================================================================
    // PALM TREE  (original, unchanged)
    // =========================================================================
    function drawPalmTree()
    {
        let p = particle(.3,.29,.3,.5,.5,.02,.06);
        p.color       = hsl(.1,.5,.1);
        p.colorRandom = .1;
        p.draw();

        for(let j = 12; j--;)
        {
            let v = .3, a = j/12*PI*2;
            let vx = Math.sin(a)*v, vy = Math.cos(a)*v;
            let p = particle(.3,.23,vx,vy-.1,.2,.05,.005);
            p.style       = 1;
            p.color       = hsl(.3,.6,random.float(.3,.5));
            p.colorRandom = .1;
            p.draw();
        }
    }

    // =========================================================================
    // START SIGN  — modern neon racing HUD
    // =========================================================================
    function drawStartSign()
    {
        // Metallic legs — 3-layer shading
        color(hsl(0,0,.24));
        rect(.06,.62,.08,.78);
        rect(.94,.62,.08,.78);
        color(hsl(0,0,.42));
        rect(.06,.62,.03,.78);
        rect(.94,.62,.03,.78);
        color(hsl(0,0,.16));
        rect(.06,.62,.008,.78);
        rect(.94,.62,.008,.78);

        // Banner: deep navy layered for depth
        for(let i = 26; i--;)
        {
            let t = i/26;
            color(hsl(.62,.90,.050+t*.095));
            rect(.5,.290-t*.002, .936-t*.004, .410-t*.003);
        }

        // Carbon-fibre texture
        for(let i = 24; i--;)
        {
            let x = .036 + i*.042;
            color(hsl(.62,.44,.086));
            rect(x,.290,.018,.398);
        }

        // Glow halos
        color(hsl(.50,1,.24));
        rectOutline(.5,.290,.954,.430,.040);
        color(hsl(.50,1,.50));
        rectOutline(.5,.290,.926,.404,.020);
        color(hsl(.50,1,.82));
        rectOutline(.5,.290,.900,.376,.008);

        // Corner accent squares
        for(let [cx,cy] of [[.060,.094],[.940,.094],[.060,.494],[.940,.494]])
        {
            color(hsl(.50,1,.56)); rect(cx,cy,.044,.044);
            color(hsl(.50,1,.84)); rect(cx,cy,.022,.022);
            color(hsl(0,0,1,.92)); rect(cx,cy,.009,.009);
        }

        // Speed lines above
        for(let i = 7; i--;)
        {
            let y  = .066+i*.013;
            let xw = random.float(.12,.54);
            let xo = random.float(-.20,.20);
            color(hsl(.50,.88,random.float(.18,.42)));
            rect(.5+xo,y,xw,.0038);
        }

        // Text shadow + main text
        color(hsl(.50,.90,.12));
        text('START',.504,.298,.222,.86,0,'arial','center',900);
        color(WHITE);
        text('START',.500,.290,.222,.86,0,'arial','center',900);

        // Rule lines + sub-label
        color(hsl(.50,1,.62));
        rect(.5,.184,.665,.006);
        rect(.5,.400,.665,.006);
        color(hsl(.50,.70,.55));
        text('READY · SET · GO',.5,.418,.054,.80,0,'arial','center',400);
    }

    // =========================================================================
    // ALL ORIGINAL SIGNS (unchanged)
    // =========================================================================
    function drawSignBackground(w=1,h=.9,c=WHITE,outlineColor=hsl(0,0,.1),outline=.05,legColor=c,legSeparation=.2)
    {
        color(legColor);
        rect((.5-legSeparation)*w,.5,.1,1);
        rect((.5+legSeparation)*w,.5,.1,1);
        color(c);
        rect(w/2,h/2,w,h);
        color(outlineColor);
        rect(w/2,h/2,w-outline,h-outline);
    }

    function drawBounceBackSign()
    {
        drawSignBackground();
        for(let i=300;i--;)
        {
            let p=1-i/300, b=Math.abs(3-4*p), l=i?0:.02;
            color(hsl(p*2,1,.5)); lineColor();
            text('BOUNCE',.5,.5-b*.15,.02+p*.3,.85,l,undefined,undefined,800);
            text('BACK',  .5,.5+b*.12,.02+p*.3,.85,l,undefined,undefined,800);
        }
    }

    function drawDwitterSign(t,size=.5,c=WHITE,color2=BLACK,font)
    {
        let signSize=size+.33;
        drawSignBackground(1,signSize,c,color2);
        color(c);
        text(t,.5,.2,size,.9,0,font,undefined,600);
        const w=.03;
        for(let i=9;i--;) rect(.25+i*w*2,.44,w,w*4);
    }

    function drawAvalancheSign()
    {
        drawSignBackground(1,.9,hsl(0,0,.2),WHITE);
        let c=hsl(0,.8,.6);
        color(c); lineColor(c);
        let y=.37;
        circle(.5,y,.32);
        text('AVALANCHE',.5,.8,.15,.9,0,undefined,undefined,600);
        color(WHITE);
        polygon(3,.5,y,.25);
        let r=.3,ox=r*Math.cos(PI/3),oy=r*Math.sin(PI/3),x=.46;
        y+=.15;
        line(x,y,x+ox,y-oy,.07);
    }

    function drawGenericSign(t,size=.5,c=WHITE,color2=BLACK,font)
    {
        let signSize=size+.1;
        drawSignBackground(1,signSize,c,color2);
        color(c);
        text(t,.5,(signSize+.05)/2,size,.9,0,font,undefined,600);
    }

    function drawZZFXSign(t='ZZFX')
    {
        drawSignBackground(1,.6,BLACK,hsl(0,0,.2));
        color(hsl(.6,1,.5));
        let x=.47,y=.38,o=.03;
        text(t,x,y,.55,.8,0,undefined,undefined,900);
        color(YELLOW);
        text(t,x+o,y-o,.55,.8,0,undefined,undefined,900);
        color(hsl(.96,1,.5));
        lineColor(WHITE);
        text(t,x+2*o,y-2*o,.55,.8,.01,undefined,undefined,900);
    }

    function drawHarrisSign()
    {
        drawSignBackground(1,.6,WHITE,hsl(.6,.9,.3),.05,BLACK,.5);
        color(WHITE);
        text('HARRIS',.5,.24,.31,.85,0,undefined,undefined,800);
        text('WALZ',  .5,.46,.20,1,  0,undefined,undefined,800);
    }

    function drawLittleJSSign()
    {
        drawSignBackground(1,.7,BLACK,WHITE,.05,WHITE,0);
        color();
        ljsText('LittleJS',0.05,.25);
        ljsText('Engine',  0.11,.5,2);

        function ljsText(t,x,y,o=0)
        {
            for(let i=0;i<t.length;i++)
            {
                let weight=900,fontSize=.21,font='arial';
                context.font=weight+' '+fontSize+'px '+font;
                let w=context.measureText(t[i]).width;
                color(hsl([1,.3,.57,.14][(i+o)%4],.9,.5));
                text(t[i],x+w/2,y,fontSize,1,.03,font,undefined,weight);
                text(t[i],x+w/2,y,fontSize,1, 0, font,undefined,weight);
                x+=w;
            }
        }
    }

    function drawCheckpointSign(side=0)
    {
        color(hsl(0,0,.2));
        rect(side,.5,.2,1);
        color(WHITE);
        rect(.5,0,1,.5);
        color(hsl(.3,.7,.5));
        text('CHECK',.5,.16,.27,.95,.01,undefined,undefined,600);
    }

    function drawLicensePlate()
    {
        color(hsl(0,0,.85));
        rect();
        color(hsl(0,0,.55));
        rectOutline(.5,.5,.9,.85,.04);
        color(hsl(0,0,.75));
        rect(.5,.5,.82,.04);
        rect(.5,.5,.04,.78);
    }
}