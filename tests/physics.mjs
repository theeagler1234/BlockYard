import fs from 'fs';
const src = fs.readFileSync(new URL('../src/js/runtime.js', import.meta.url),'utf8');
const a = src.indexOf('// <physics-core>'), b = src.indexOf('// </physics-core>');
const { stepBody, noHits } = new Function(src.slice(a, b) + '; return { stepBody, noHits };')();
let fails = 0;
const ok = (name, cond, extra='') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; };
const box = (min, max, ref) => ({ box: { min: {x:min[0],y:min[1],z:min[2]}, max: {x:max[0],y:max[1],z:max[2]} }, ref });
const body = (pos, half=[.5,.5,.5], vel=[0,0,0]) => ({ pos:{x:pos[0],y:pos[1],z:pos[2]}, half:{x:half[0],y:half[1],z:half[2]}, vel:{x:vel[0],y:vel[1],z:vel[2]} });
const run = (bd, solids, frames, dt=1/60, g=-20, each) => { let hit; for (let i=0;i<frames;i++){ each?.(i,bd,hit); hit = stepBody(bd, solids, g, dt);} return hit; };

// Starter scene: floor top at y=0, cube starting on it (the exact case that breaks with float error)
const floor = box([-3,-0.2,-3],[3,0,3],'floor');
let c = body([0,0.5,0]);
let hit = run(c,[floor],300);
ok('rests on floor at y=0.5', Math.abs(c.pos.y-0.5) < 1e-3, c.pos.y);
ok('hit.down is the floor, every frame', hit.down === 'floor');
ok('no sideways hits while standing', !hit.left && !hit.right && !hit.forward && !hit.back && !hit.up);

// Falling from height lands
c = body([0,10,0]); hit = run(c,[floor],240);
ok('falls from y=10 and lands', Math.abs(c.pos.y-0.5) < 1e-3 && hit.down === 'floor', c.pos.y);

// Walking on the floor is not blocked by the floor (the float-error bug)
c = body([0,0.5,0],[.5,.5,.5],[4,0,0]); run(c,[floor],30, 1/60, -20, (i,bd)=>{bd.vel.x=4;});
ok('walks along floor without sticking', c.pos.x > 1.9 && Math.abs(c.pos.y-0.5)<1e-3, `x=${c.pos.x} y=${c.pos.y}`);

// Walls: each face
const wallR = box([2,0,-5],[2.5,3,5],'wallR');
c = body([0,0.5,0]); let seen=null; run(c,[floor,wallR],120,1/60,-20,(i,bd,h)=>{bd.vel.x=4; if(h?.right) seen=h.right;});
ok('hits right face of wall (+x)', seen==='wallR' && Math.abs(c.pos.x-1.5)<1e-3, `x=${c.pos.x}`);
const wallL = box([-2.5,0,-5],[-2,3,5],'wallL');
c = body([0,0.5,0]); seen=null; run(c,[floor,wallL],120,1/60,-20,(i,bd,h)=>{bd.vel.x=-4; if(h?.left) seen=h.left;});
ok('hits left face (-x)', seen==='wallL' && Math.abs(c.pos.x+1.5)<1e-3);
const wallF = box([-5,0,-2.5],[5,3,-2],'wallF');
c = body([0,0.5,0]); seen=null; run(c,[floor,wallF],120,1/60,-20,(i,bd,h)=>{bd.vel.z=-4; if(h?.forward) seen=h.forward;});
ok('hits forward face (-z)', seen==='wallF' && Math.abs(c.pos.z+1.5)<1e-3);
const wallB = box([-5,0,2],[5,3,2.5],'wallB');
c = body([0,0.5,0]); seen=null; run(c,[floor,wallB],120,1/60,-20,(i,bd,h)=>{bd.vel.z=4; if(h?.back) seen=h.back;});
ok('hits back face (+z)', seen==='wallB' && Math.abs(c.pos.z-1.5)<1e-3);

// Sliding along a wall keeps the other axis moving
c = body([0,0.5,0]); run(c,[floor,wallR],120,1/60,-20,(i,bd)=>{bd.vel.x=4; bd.vel.z=-2;});
ok('slides along wall while pushing into it', Math.abs(c.pos.x-1.5)<1e-3 && c.pos.z < -2, `x=${c.pos.x} z=${c.pos.z}`);

// Jump + ceiling bonk
const ceil = box([-3,1.8,-3],[3,2.0,3],'ceil');
c = body([0,0.5,0]); let bonked=false; run(c,[floor,ceil],60,1/60,-20,(i,bd,h)=>{ if(i===0) bd.vel.y=9; if(h?.up) bonked=true; });
ok('jump hits ceiling (up face)', bonked);
// Jump height without ceiling ~ v^2/2g = 2.0
c = body([0,0.5,0]); let peak=0; run(c,[floor],90,1/60,-20,(i,bd)=>{ if(i===0) bd.vel.y=9; peak=Math.max(peak,bd.pos.y); });
ok('jump peak ~2.5 (0.5 + 2.0)', Math.abs(peak-2.5)<0.1, peak);

// Tunneling: fast mover vs a very thin wall
const thin = box([2,-1,-5],[2.05,3,5],'thin');
c = body([0,0.5,0],[.1,.1,.1]); hit = run(c,[floor,thin],30,1/60,0,(i,bd)=>{bd.vel.x=300; bd.vel.y=0;});
ok('300 u/s does not tunnel through 0.05 wall', c.pos.x < 2, `x=${c.pos.x}`);
// Falling very fast onto the floor
c = body([0,100,0]); hit = run(c,[floor],600,1/60);
ok('terminal-speed fall still lands', Math.abs(c.pos.y-0.5)<1e-3 && c.pos.y>0, c.pos.y);

// Collisions off on the solid => pass through; off on mover => ghost
c = body([0,3,0]); run(c,[],120);
ok('no solids (collisions off): falls through', c.pos.y < -10, c.pos.y);

// Gravity 0 floats
c = body([0,3,0]); run(c,[floor],120,1/60,0);
ok('gravity 0: stays put', Math.abs(c.pos.y-3)<1e-9);

// Landing on the edge then walking off falls
c = body([2.8,0.5,0]); run(c,[floor],180,1/60,-20,(i,bd)=>{bd.vel.x=3;});
ok('walks off the edge and falls', c.pos.y < -1, c.pos.y);

// Landing on top of a box lands on box, not floor
const crate = box([-1,0,-1],[1,1,1],'crate');
c = body([0,5,0]); hit = run(c,[floor,crate],240);
ok('lands on top of a crate', hit.down==='crate' && Math.abs(c.pos.y-1.5)<1e-3, c.pos.y);
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails?1:0);
