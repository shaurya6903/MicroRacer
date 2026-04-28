'use strict';

let vehicleShadowList;
function drawCars()
{
    vehicleShadowList = [];
    vehicles = vehicles.filter(o=>!o.destroyed);
    for(const v of vehicles)
        v.draw();

    glPolygonOffset(80);
    glSetDepthTest(1,0);
    for(let v of vehicleShadowList)
        pushShadow(...v);
    glRender();   
    glPolygonOffset(false);
    glSetDepthTest();
}

// Random vivid car colors — called once per NPC vehicle spawn
function randomCarColor()
{
    const palettes = [
        hsl(.0,  .9, .45),  // red
        hsl(.05, .95,.5 ),  // orange-red
        hsl(.08, 1,  .5 ),  // orange
        hsl(.13, 1,  .52),  // yellow-orange
        hsl(.55, .9, .48),  // cyan-blue
        hsl(.6,  .9, .5 ),  // blue
        hsl(.65, .8, .5 ),  // indigo
        hsl(.72, .8, .48),  // purple
        hsl(.82, .8, .5 ),  // magenta
        hsl(.0,  .0, .14),  // near-black
        hsl(.0,  .0, .88),  // pearl white
        hsl(.0,  .0, .55),  // silver
    ];
    return palettes[randInt(palettes.length)];
}

// shade values: positive = lighter, negative = darker (blended toward white/black)
const CAR_MODELS_CONFIG = [
    // 0: Low sports coupe — tightened body (was 950 long, now 680)
    {
        wheelbase: { frontZ: 260, rearZ: -260, sideX: 200 },
        parts: [
            // lower body slab — shortened from 950 → 680
            { pos: vec3(0,   55,   0),    size: vec3(210, 72,  680), shade:  0    },
            // cabin block
            { pos: vec3(0,  168,  20),    size: vec3(185,122,  310), shade:  .06  },
            // hood — flat extension forward
            { pos: vec3(0,  105,-270),    size: vec3(200, 26,  210), shade: -.03  },
            // trunk
            { pos: vec3(0,  105, 280),    size: vec3(200, 26,  160), shade: -.03  },
            // front bumper
            { pos: vec3(0,   36,-360),    size: vec3(205, 40,   44), shade: -.12  },
            // rear bumper
            { pos: vec3(0,   36, 356),    size: vec3(205, 40,   44), shade: -.12  },
            // skirt L — matched to new body length
            { pos: vec3(-122, 26,  0),    size: vec3(12,  26,  560), shade: -.16  },
            // skirt R
            { pos: vec3( 122, 26,  0),    size: vec3(12,  26,  560), shade: -.16  },
            // roof panel
            { pos: vec3(0,  234,  14),    size: vec3(200, 14,  250), shade:  .1   },
            // rear spoiler blade
            { pos: vec3(0,  252, 238),    size: vec3(190, 18,   16), shade: -.22  },
            // spoiler pillar L
            { pos: vec3(-68, 242, 238),   size: vec3(13,  34,   13), shade: -.28  },
            // spoiler pillar R
            { pos: vec3( 68, 242, 238),   size: vec3(13,  34,   13), shade: -.28  },
        ]
    },
    // 1: Muscle car — unchanged
    {
        wheelbase: { frontZ: 310, rearZ: -310, sideX: 200 },
        parts: [
            { pos: vec3(0,   68,   0),    size: vec3(220,100,  980), shade:  0    },
            { pos: vec3(0,  188,  20),    size: vec3(200,148,  420), shade:  .05  },
            { pos: vec3(0,  118,-335),    size: vec3(210, 44,  300), shade: -.02  },
            { pos: vec3(0,  118, 348),    size: vec3(210, 44,  250), shade: -.02  },
            { pos: vec3(0,   48,-462),    size: vec3(210, 52,   60), shade: -.12  },
            { pos: vec3(0,   48, 458),    size: vec3(210, 52,   60), shade: -.12  },
            { pos: vec3(-142, 34,  0),    size: vec3(14,  38,  810), shade: -.15  },
            { pos: vec3( 142, 34,  0),    size: vec3(14,  38,  810), shade: -.15  },
            { pos: vec3(0,  250,   8),    size: vec3(254, 18,  335), shade:  .08  },
            // hood scoop outer
            { pos: vec3(0,  152,-205),    size: vec3(82,  18,  125), shade: -.18  },
            // hood scoop inner (dark slot)
            { pos: vec3(0,  160,-205),    size: vec3(48,   8,  105), shade: -.4   },
        ]
    },
];

class Vehicle
{
    constructor(z, color = WHITE, modelIndex = 0)
    {
        this.lane          = randInt(2);
        this.pos           = vec3(0,0,z);
        this.targetSpeed   = 140;
        this.velocity      = vec3(0,0,this.targetSpeed);
        this.color         = color;
        this.isPlayer      = 0;
        this.modelIndex    = modelIndex % CAR_MODELS_CONFIG.length;
        this.breaking      = 0;
        this.turn          = 0;
        this.wheelTurn     = 0;
        this.collisionSize = vec3(240,200,350);
        this.laneChangeTimer = 0;
    }

    update()
    {
        if (this.isPlayer) return;

        // Lane switching AI
        if (this.laneChangeTimer > 0) this.laneChangeTimer--;
        const playerDeltaZ = playerVehicle.pos.z - this.pos.z;
        if (playerDeltaZ > 0 && playerDeltaZ < 2000 && this.laneChangeTimer === 0) {
            const dx = Math.abs(this.pos.x - playerVehicle.pos.x);
            if (dx < 300) {
                // Too close, change lane!
                this.lane = this.lane === 0 ? 1 : 0;
                this.laneChangeTimer = 100;
            }
        }

        if (this.velocity.z < this.targetSpeed)
            this.velocity.z += .5;
        else if (this.velocity.z > this.targetSpeed+5)
            this.velocity.z -= 2;
        this.pos.z += this.velocity.z;

        const trackInfo  = new TrackSegmentInfo(this.pos.z);
        const trackInfo2 = new TrackSegmentInfo(this.pos.z+trackSegmentLength);
        if (!trackInfo.pos || !trackInfo2.pos) return;

        const x    = -trackWidth/2 + this.lane*trackWidth;
        this.pos.x = trackInfo.pos.x + x;
        this.pos.y = trackInfo.offset.y;

        const delta  = trackInfo2.pos.subtract(trackInfo.pos);
        this.turn    = Math.atan2(delta.x, delta.z);
        this.wheelTurn = this.turn;

        const playerDelta = this.pos.z - playerVehicle.pos.z;
        if (playerDelta > 5e4 || playerDelta < -2e3) this.destroyed = 1;
    }

    draw()
    {
        const trackInfo    = new TrackSegmentInfo(this.pos.z);
        const vehicleHeight = 60;
        let p = this.pos.copy();
        p.y  += vehicleHeight;
        p.z   = p.z - cameraOffset;

        const heading    = this.turn;
        const trackPitch = trackInfo.pitch;
        const m2 = buildMatrix(p, vec3(trackPitch,0,0));
        const m1 = m2.multiply(buildMatrix(0, vec3(0,heading,0), 0));

        const cfg = CAR_MODELS_CONFIG[this.modelIndex];
        const col = this.color;

        glPolygonOffset(50);

        // ── Body panels ───────────────────────────────────────────────────────
        for (const part of cfg.parts)
        {
            const s = part.shade;
            const panelColor = s >= 0 ? lerpColor(col, WHITE, s) : lerpColor(col, BLACK, -s);
            cubeMesh.render(m1.multiply(buildMatrix(part.pos, 0, part.size)), panelColor);
        }

        // ── Glass — dark tint ─────────────────────────────────────────────────
        const glass = hsl(0, 0, .07);
        cubeMesh.render(m1.multiply(buildMatrix(vec3(0,  175, -150), vec3(-.14,0,0), vec3(185, 92, 10))), glass);
        cubeMesh.render(m1.multiply(buildMatrix(vec3(0,  172,  218), vec3( .18,0,0), vec3(170, 82, 10))), glass);
        cubeMesh.render(m1.multiply(buildMatrix(vec3(-107, 176, 42), 0,              vec3(10,  85, 285))), glass);
        cubeMesh.render(m1.multiply(buildMatrix(vec3( 107, 176, 42), 0,              vec3(10,  85, 285))), glass);

        // ── Headlights (front = negative Z) ──────────────────────────────────
        const fz = -(cfg.wheelbase.frontZ + 100);
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3(-88, 68, fz), 0, vec3(50,13,10))), hsl(.12,1,.95), 1);
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3( 88, 68, fz), 0, vec3(50,13,10))), hsl(.12,1,.95), 1);
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3(0,   78, fz), 0, vec3(160,5,8))),  hsl(.1,1,1),   1);

        // ── Tail lights (rear = positive Z) ──────────────────────────────────
        // rz must be POSITIVE to sit at the back of the car
        const rz        = cfg.wheelbase.frontZ + 100;
        const isBraking = this.isBraking;
        const tailCol   = isBraking ? hsl(0,1,.65) : hsl(0,.9,.3);
        const tailGlow  = isBraking ? 1 : 0;
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3(-88, 68, rz), 0, vec3(50,13,10))), tailCol, tailGlow);
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3( 88, 68, rz), 0, vec3(50,13,10))), tailCol, tailGlow);
        cubeMesh.renderUnlit(m1.multiply(buildMatrix(vec3(0,   68, rz), 0, vec3(155,5,10))), isBraking ? hsl(0,1,.5) : hsl(0,.8,.18), tailGlow);

        // ── Exhaust ───────────────────────────────────────────────────────────
        cubeMesh.render(m1.multiply(buildMatrix(vec3(-58, 24, rz), 0, vec3(20,15,18))), hsl(0,0,.2));
        cubeMesh.render(m1.multiply(buildMatrix(vec3( 58, 24, rz), 0, vec3(20,15,18))), hsl(0,0,.2));
        cubeMesh.render(m1.multiply(buildMatrix(vec3(-58, 24, rz+2), 0, vec3(11,7,6))),  hsl(0,0,.04));
        cubeMesh.render(m1.multiply(buildMatrix(vec3( 58, 24, rz+2), 0, vec3(11,7,6))),  hsl(0,0,.04));

        // ── Player license plate ──────────────────────────────────────────────
        if (this.isPlayer)
            quadMesh.renderTile(m1.multiply(buildMatrix(vec3(0,50,fz-10), 0, vec3(80,25))), WHITE, getGenerativeTile(vec3(3,0)));

        glPolygonOffset(false);

        // ── Wheels ────────────────────────────────────────────────────────────
        const wb          = cfg.wheelbase;
        const wheelRadius = 105;
        const wheelSize   = vec3(38, wheelRadius, wheelRadius);
        const spin        = this.pos.z / 500;
        const wFront      = buildMatrix(0, vec3(spin, this.wheelTurn, 0), wheelSize);
        const wRear       = buildMatrix(0, vec3(spin, 0, 0),             wheelSize);
        const wCol        = hsl(0,0,.09);
        const hubCol      = hsl(0,0,.32);

        for (let i = 4; i--;)
        {
            const front = i < 2;
            const side  = i % 2 ? 1 : -1;
            const ox    = side * wb.sideX;
            const oz    = front ? wb.frontZ : wb.rearZ;
            const o     = vec3(ox, 18, oz);
            carWheel.render(m1.multiply(buildMatrix(o)).multiply(front ? wFront : wRear), wCol);
            // hub cap
            cubeMesh.render(m1.multiply(buildMatrix(vec3(ox + side*18, 18, oz), 0, vec3(7,52,52))), hubCol);
        }

        // ── Shadow ────────────────────────────────────────────────────────────
        p.y = this.pos.y;
        vehicleShadowList.push([p, 570, 570, vec3(trackPitch,heading,0), 2]);
    }
}

class PlayerVehicle extends Vehicle
{
    constructor(z, color, modelIndex = 0)
    {
        super(z, color, modelIndex);
        this.isPlayer   = 1;
        this.targetSpeed = 250;
        this.bumpTimer  = 0;
        this.airTime    = 0;
        this.playerTurn = 0;
        this.velocity   = vec3();
        this.hitTimer   = new Timer;
    }

    draw() { attractMode || super.draw(); }

    update()
    {
        if (attractMode)
        {
            this.pos.z += this.velocity.x = min(this.velocity.x += .1, 20);
            return;
        }

        this.turn = this.playerTurn * clamp(this.velocity.z / 49);

        const forwardDamping    = .998;
        const playerMaxSpeed    = 250;
        const playerTurnControl = .3;
        const centrifugal       = .002;
        const gravity           = -2;
        const lateralDamping    = .7;
        const maxPlayerX        = 2e3;
        const playerAccel       = 1;
        const playerBrake       = 2;

        if (playerVehicle.pos.z > nextCheckpointDistance)
        {
            nextCheckpointDistance += checkpointDistance;
            checkpointTimeLeft     += 40;
            speak('CHECKPOINT');
            sound_checkpoint.play();
        }

        for (const v of vehicles)
        {
            if (v.isPlayer) continue;
            const d = this.pos.subtract(v.pos).abs();
            const s = this.collisionSize.add(v.collisionSize);
            if (d.x < s.x && d.z < s.z)
            {
                const vel     = this.velocity;
                this.velocity = v.velocity.scale(.7);
                v.velocity.z  = max(v.velocity.z, vel.z * .7);
                this.hit();
            }
        }

        let playerInput = vec3(
            keyIsDown('ArrowRight') - keyIsDown('ArrowLeft'),
            keyIsDown('ArrowUp')    - keyIsDown('ArrowDown'));

        if (playerInput.x || playerInput.y) mouseControl = 0;
        if (mouseWasPressed(0) || mouseWasPressed(2)) mouseControl = 1;

        if (mouseControl)
        {
            playerInput.y = 0;
            if (mouseIsDown(0)) playerInput.y = 1;
            if (mouseIsDown(2)) playerInput.y = -1;
            const center  = this.pos.x / 4e3;
            playerInput.x = clamp(4 * (mousePos.x - .5 - center), -1, 1);
        }

        if (gameOverTimer.isSet()) playerInput = vec3();
        if (testDrive) this.velocity.z = 30;

        this.velocity.y += gravity;
        this.velocity.x *= lateralDamping;
        this.pos = this.pos.add(this.velocity);

        const pti = new TrackSegmentInfo(this.pos.z);

        let desiredPlayerTurn = playerInput.x * playerTurnControl;
        if (startCountdown > 0) desiredPlayerTurn = 0;

        this.wheelTurn      = lerp(.2, this.wheelTurn,  2 * desiredPlayerTurn);
        desiredPlayerTurn  *= lerp(this.velocity.z / playerMaxSpeed, 1, .3);
        this.playerTurn     = lerp(.1, this.playerTurn, desiredPlayerTurn);

        this.velocity.x +=
            this.velocity.z * this.playerTurn -
            this.velocity.z ** 2 * centrifugal * pti.offset.x;
        this.pos.x = clamp(this.pos.x, -maxPlayerX, maxPlayerX);

        let onGround = 0;
        if (this.pos.y < pti.offset.y)
        {
            this.pos.y = pti.offset.y;
            const tp   = pti.pitch;
            if (!gameOverTimer.isSet())
            {
                const rv = vec3(0, Math.cos(tp), Math.sin(tp))
                    .scale(0 * (Math.cos(tp) * this.velocity.y + Math.sin(tp) * this.velocity.z));
                this.velocity = this.velocity.add(rv);
            }

            if (Math.abs(this.pos.x) > pti.width - this.collisionSize.x)
            {
                this.velocity.z *= .98;
                this.bumpTimer  += this.velocity.z * rand(.8,1.2);
                if (this.bumpTimer > 200)
                {
                    this.velocity.y += min(50, this.velocity.z) * .1 * rand(1,2);
                    this.bumpTimer   = 0;
                    sound_bump.play();
                }
            }

            this.airTime    = 0;
            onGround        = 1;
            this.velocity.z = Math.max(0, forwardDamping * this.velocity.z);
            if (this.velocity.z < 10) this.velocity.z *= .95;
        }
        else this.airTime += timeDelta;

        this.isBraking = playerInput.y < 0;

        if (onGround)
        {
            if (this.velocity.z > 5 && time % 0.1 < 0.05) sound_engine.play();
            if (playerInput.y > 0)
                this.velocity.z += playerInput.y * lerp(this.velocity.z / playerMaxSpeed, playerAccel, 0);
            else if (this.isBraking)
                this.velocity.z += playerInput.y * playerBrake;
        }

        this.velocity.z = max(0, this.velocity.z);
        if (startCountdown > 0)    this.velocity.z = 0;
        if (gameOverTimer.isSet()) this.velocity    = this.velocity.scale(.95);

        // sprite collisions
        {
            const co  = playerVehicle.pos.z - cameraPlayerOffset.z;
            const cti = new TrackSegmentInfo(co);
            for (let i = 40; i--;)
            {
                const seg = track[cti.segment + i];
                if (!seg) continue;
                for (const sprite of seg.sprites)
                {
                    if (!sprite.collideSize) continue;
                    const pos = seg.offset.add(sprite.offset);
                    const z   = pos.z - this.pos.z;
                    if (z > this.collisionSize.z || z < -this.collisionSize.z) continue;
                    if (abs(this.pos.x - pos.x) > this.collisionSize.x + abs(sprite.collideSize)) continue;
                    this.velocity.x = -100 * sign(this.pos.x);
                    this.velocity   = this.velocity.scale(.9);
                    this.hit();
                    break;
                }
            }
        }
    }

    hit()
    {
        if (!this.hitTimer.active())
        {
            sound_hit.play();
            this.hitTimer.set(.5);
        }
    }
}