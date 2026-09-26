
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

const Imports =
{
    env:
    {
        DebugLog: (Pointer) => console.log(CString(Pointer)),

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

        WebGL_GenBuffer: () => { Buffers.push(GL.createBuffer()); return Buffers.length -1; },
        WebGL_BindBuffer: (Target, BufferID) => GL.bindBuffer(Target, Buffers[BufferID]),
        WebGL_BufferData: (Target, Pointer, Length, Usage) => GL.bufferData(Target, CMemoryView(Pointer, Length), Usage),
        WebGL_EnableVertexAttribArray: (Location) => GL.enableVertexAttribArray(Location),
        WebGL_VertexAttribPointer: (Location, Size, Type, Normalized, Stride, Offset) =>
        {
            GL.vertexAttribPointer(Location, Size, Type, !!Normalized, Stride, Offset);
        },

        WebGL_CreateVertexArray: () => { VertexArrays.push(GL.createVertexArray()); return VertexArrays.length - 1; },
        WebGL_BindVertexArray: (VertexArrayID) => GL.bindVertexArray(VertexArrays[VertexArrayID]),

        WebGL_DrawArrays: (Mode, First, Count) => GL.drawArrays(Mode, First, Count),
    }
};

const Response   = await fetch('wasm_triangle.wasm');
const WasmStream = await WebAssembly.instantiateStreaming(Response, { env: Imports.env });

WASM = WasmStream.instance;
Memory = WASM.exports.memory;

WASM.exports.Init();

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

let TimeLast = performance.now();

function OnFrame(TimeNow)
{
    const DeltaTime = (TimeNow - TimeLast) * 0.001;
    TimeLast = TimeNow;

    WASM.exports.Frame(DeltaTime);

    requestAnimationFrame(OnFrame);
}

OnResize();
requestAnimationFrame(OnFrame);

