
const Canvas = document.getElementById('MainCanvas');
const GL = Canvas.getContext('webgl2', { antialias: true });

if (!GL)
    throw new error('WebGL2 is required to run this web application');

let WASM, Memory;

const TextDec = new TextDecoder();
const TextEnc = new TextEncoder();

const u8 = () => new Uint8Array(Memory.buffer);

function CString(Pointer)
{
    const Bytes = u8();
    let End = Pointer;

    while (Bytes[End] !== 0)
        End++;

    return TextDec.decode(Bytes.subarray(Pointer, End));
}

function CMemoryView(Pointer, Length)
{
    return u8().subarray(Pointer, Pointer + Length);
}

const Shaders       = [];
const Programs      = [];
const Buffers       = [];
const VertexArrays  = [];
const Textures      = [];
const Uniforms      = [];

const Imports =
{
    env:
    {
        DebugLog: (Pointer) => console.log(CString(Pointer)),

        JS_MillisecondsNow: () => performance.now(),

        WebGL_ClearColor: (R, G, B, A) => GL.clearColor(R, G, B, A),
        WebGL_Clear: (BufferMask) => GL.clear(BufferMask),
        WebGL_Viewport: (X, Y, Width, Height) => GL.viewport(X, Y, Width, Height),

        WebGL_CreateShader: (Type) => { Shaders.push(GL.createShader(Type)); return Shaders.length - 1; },
        WebGL_ShaderSource: (ShaderID, Pointer) => GL.shaderSource(Shaders[ShaderID], CString(Pointer)),
        WebGL_CompileShader: (ShaderID) => GL.compileShader(Shaders[ShaderID]),
        WebGL_GetShaderIV: (ShaderID, Parameter) => GL.getShaderParameter(Shaders[ShaderID], Parameter) ? 1 : 0,
        WebGL_GetShaderInfoLog: (ShaderID, Pointer, MaxLength) =>
        {
            const Log = GL.getShaderInfoLog(Shaders[ShaderID]) || '';
            const Enc = TextEnc.encode(Log);

            const Dest = u8();
            const Length = Math.min(Enc.length, MaxLength - 1);

            Dest.set(Enc.subarray(0, Length), Pointer);
            Dest[Pointer + Length] = 0;
        },

        WebGL_CreateProgram: () => { Programs.push(GL.createProgram()); return Programs.length - 1; },
        WebGL_AttachShader: (ProgramID, ShaderID) => GL.attachShader(Programs[ProgramID], Shaders[ShaderID]),
        WebGL_LinkProgram: (ProgramID) => GL.linkProgram(Programs[ProgramID]),
        WebGL_GetProgramIV: (ProgramID, Parameter) => GL.getProgramParameter(Programs[ProgramID], Parameter) ? 1 : 0,
        WebGL_GetProgramInfoLog: (ProgramID, Pointer, MaxLength) =>
        {
            const Log = GL.getProgramInfoLog(Programs[ProgramID]) || '';
            const Enc = TextEnc.encode(Log);

            const Dest = u8();
            const Length = Math.min(Enc.length, MaxLength - 1);

            Dest.set(Enc.subarray(0, Length), Pointer);
            Dest[Pointer + Length] = 0;
        },
        WebGL_UseProgram: (ProgramID) => GL.useProgram(Programs[ProgramID]),

        WebGL_GetUniformLocation: (ProgramID, NamePointer) =>
        {
            const Uniform = GL.getUniformLocation(Programs[ProgramID], CString(NamePointer));
            Uniforms.push(Uniform);
            return Uniforms.length - 1;
        },

        WebGL_Uniform1I: (UniformLocation, Value) => GL.uniform1i(Uniforms[UniformLocation], Value),

        WebGL_CreateTexture: () => { Textures.push(GL.createTexture()); return Textures.length - 1; },
        WebGL_BindTexture: (Target, TextureID) => GL.bindTexture(Target, Textures[TextureID]),
        WebGL_ActiveTexture: (Unit) => GL.activeTexture(Unit),
        WebGL_TexParameterI: (Target, Parameter, Value) => GL.texParameteri(Target, Parameter, Value),
        WebGL_TexImage2D: (Target, Level, InternalFormat, Width, Height, Border, Format, Type, Pointer) =>
        {
            let ImageSizeInBytes = 0;

            if (Format == 0x1908) // NOTE(vak): GL_RGBA
                ImageSizeInBytes = Width*Height*4;

            else if (Format == 0x1907) // NOTE(vak): GL_RGB
                ImageSizeInBytes = WIdth*Height*3;

            else if (Format == 0x1906) // NOTE(vak): GL_ALPHA
                ImageSizeInBytes = Width*Height*1;

            const Pixels = new Uint8Array(Memory.buffer, Pointer, Pointer + ImageSizeInBytes);
            GL.texImage2D(Target, Level, InternalFormat, Width, Height, Border, Format, Type, Pixels);
        },

        WebGL_CreateVertexArray: () => { VertexArrays.push(GL.createVertexArray()); return VertexArrays.length - 1; },
        WebGL_BindVertexArray: (VertexArrayID) => GL.bindVertexArray(VertexArrays[VertexArrayID]),

        WebGL_GenBuffer: () => { Buffers.push(GL.createBuffer()); return Buffers.length -1; },
        WebGL_BindBuffer: (Target, BufferID) => GL.bindBuffer(Target, Buffers[BufferID]),
        WebGL_BufferData: (Target, Pointer, Length, Usage) => GL.bufferData(Target, CMemoryView(Pointer, Length), Usage),
        WebGL_BufferSubData: (Target, Offset, Length, Pointer) => GL.bufferSubData(Target, Offset, CMemoryView(Pointer, Length)),
        WebGL_EnableVertexAttribArray: (Location) => GL.enableVertexAttribArray(Location),
        WebGL_VertexAttribPointer: (Location, Size, Type, Normalized, Stride, Offset) =>
        {
            GL.vertexAttribPointer(Location, Size, Type, !!Normalized, Stride, Offset);
        },

        WebGL_DrawArrays: (Mode, First, Count) => GL.drawArrays(Mode, First, Count),
    }
};

const Response   = await fetch('finite.wasm');
const WasmStream = await WebAssembly.instantiateStreaming(Response, { env: Imports.env });

WASM = WasmStream.instance;
Memory = WASM.exports.memory;

function OnResize()
{
    const DevicePixelRatio = Math.min(2, window.devicePixelRatio || 1);

    const Width  = Math.floor(Canvas.clientWidth  * DevicePixelRatio);
    const Height = Math.floor(Canvas.clientHeight * DevicePixelRatio);

    if (Canvas.width !== Width || Canvas.height !== Height)
    {
        Canvas.width  = Width;
        Canvas.height = Height;

        WASM.exports.Resize(Width, Height);
    }
}

window.addEventListener('resize', OnResize);

function HandleKey(KeyEvent)
{
    const KeyCode = KeyEvent.Code;
    const IsDown = KeyEvent.IsDown;

    if ((KeyCode === 'KeyW') || (KeyCode == 'ArrowUp'))
        WASM.exports.ReportMoveUp(IsDown);

    else if ((KeyCode === 'KeyS') || (KeyCode == 'ArrowDown'))
        WASM.exports.ReportMoveDown(IsDown);

    else if ((KeyCode === 'KeyA') || (KeyCode == 'ArrowLeft'))
        WASM.exports.ReportMoveLeft(IsDown);

    else if ((KeyCode === 'KeyD') || (KeyCode == 'ArrowRight'))
        WASM.exports.ReportMoveRight(IsDown);

    else if ((KeyCode === 'Space'))
        WASM.exports.ReportShoot(IsDown);

    else if ((KeyCode === 'Digit1'))
        WASM.exports.ReportWeapon1(IsDown);

    else if ((KeyCode === 'Digit2'))
        WASM.exports.ReportWeapon2(IsDown);

    else if ((KeyCode === 'Digit3'))
        WASM.exports.ReportWeapon3(IsDown);

    else if ((KeyCode === 'KeyQ'))
        WASM.exports.ReportPrev(IsDown);

    else if ((KeyCode === 'KeyE'))
        WASM.exports.ReportNext(IsDown);

    else if ((KeyCode === 'KeyF'))
        WASM.exports.ReportBuy(IsDown);
}

let BufferedKeys = [];

addEventListener('keydown', (Event) =>
{
    BufferedKeys.push({Code: Event.code, IsDown: 1});
});

addEventListener('keyup', (Event) =>
{
    BufferedKeys.push({Code: Event.code, IsDown: 0});
});

let TimeLast = performance.now();
let TimeAccum = 0.0;
let TimeStep = 1.0/165.0;

function OnFrame(TimeNow)
{
    const DeltaTime = (TimeNow - TimeLast) * 0.001;
    TimeAccum += DeltaTime;
    TimeLast = TimeNow;

    while (TimeAccum >= TimeStep)
    {
        WASM.exports.PrepareInput();

        BufferedKeys.forEach(HandleKey);
        BufferedKeys = [];

        WASM.exports.Frame(TimeStep);

        TimeAccum -= TimeStep;
    }

    requestAnimationFrame(OnFrame);
}

GL.enable(GL.BLEND);
GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

const RandomSeed = BigInt(performance.now() * 1e9);
WASM.exports.Init(RandomSeed);
OnResize();
requestAnimationFrame(OnFrame);

