#!/usr/bin/env python3
"""Minidump reader: exception info, arm64 thread context, fp-walk backtrace.

Correct MINIDUMP_THREAD layout (48 bytes) including the Teb field the first
iteration missed:
  0 ThreadId u32 | 4 SuspendCount u32 | 8 PriorityClass u32 | 12 Priority u32
  16 Teb u64 | 24 Stack.StartOfMemoryRange u64 | 32 Stack.DataSize u32
  36 Stack.Rva u32 | 40 Context.DataSize u32 | 44 Context.Rva u32
CONTEXT_ARM64: u32 flags, u32 cpsr, x0..x28 (29*u64), fp, lr, sp, pc.
"""
import struct
import sys

def u32(b, o): return struct.unpack_from("<I", b, o)[0]
def u64(b, o): return struct.unpack_from("<Q", b, o)[0]

def read_string(data, rva):
    if rva == 0 or rva >= len(data):
        return "?"
    length = u32(data, rva)
    return data[rva + 4 : rva + 4 + length].decode("utf-16-le", errors="replace")

def parse(path):
    data = open(path, "rb").read()
    assert data[:4] == b"MDMP", "not a minidump"
    n_streams, dir_rva = u32(data, 8), u32(data, 12)
    streams = {}
    for i in range(n_streams):
        off = dir_rva + i * 12
        streams.setdefault(u32(data, off), []).append((u32(data, off + 4), u32(data, off + 8)))

    arch = "?"
    if 7 in streams:
        _, rva = streams[7][0]
        arch = {0: "x86", 9: "x64", 12: "arm64"}.get(struct.unpack_from("<H", data, rva)[0], "?")

    modules = []
    if 4 in streams:
        _, rva = streams[4][0]
        for i in range(u32(data, rva)):
            off = rva + 4 + i * 108
            modules.append((u64(data, off), u32(data, off + 8), read_string(data, u32(data, off + 20))))

    def sym(addr):
        for base, size, name in modules:
            if base <= addr < base + size:
                return f"{name.split('/')[-1]}+{hex(addr - base)}"
        return None

    print(f"== {path.split('/')[-1]} ({arch}, {len(modules)} modules) ==")
    if 6 not in streams:
        print("no exception stream")
        return
    _, erva = streams[6][0]
    thread_id, code, exc_addr = u32(data, erva), u32(data, erva + 8), u64(data, erva + 24)
    print(f"exception code: {hex(code)}  faulting access: {hex(exc_addr)} ({sym(exc_addr) or 'unmapped'})")
    print(f"crashing thread: {thread_id}")

    # Exception stream carries its own context (ThreadContext at erva+32:
    # DataSize u32, Rva u32) — prefer it; fall back to the thread list's.
    ctx_rva = u32(data, erva + 36)
    if not ctx_rva and 3 in streams:
        _, trva = streams[3][0]
        for i in range(u32(data, trva)):
            off = trva + 4 + i * 48
            if u32(data, off) == thread_id:
                ctx_rva = u32(data, off + 44)
                break

    stack_start = stack_bytes = None
    if 3 in streams:
        _, trva = streams[3][0]
        for i in range(u32(data, trva)):
            off = trva + 4 + i * 48
            if u32(data, off) == thread_id:
                stack_start = u64(data, off + 24)
                size, srva = u32(data, off + 32), u32(data, off + 36)
                stack_bytes = data[srva : srva + size]
                break

    if not ctx_rva:
        print("no thread context found")
        return
    fp, lr, sp, pc = (u64(data, ctx_rva + o) for o in (240, 248, 256, 264))
    print(f"pc = {hex(pc)}  {sym(pc) or 'unmapped'}")
    print(f"lr = {hex(lr)}  {sym(lr) or 'unmapped'}")
    print(f"sp = {hex(sp)}  fp = {hex(fp)}")

    if stack_bytes is None:
        print("no stack memory")
        return
    print(f"fp-walk backtrace (stack {len(stack_bytes)} bytes @ {hex(stack_start)}):")
    frame, seen = fp, 0
    while seen < 32:
        idx = frame - stack_start
        if idx < 0 or idx + 16 > len(stack_bytes):
            break
        next_fp = u64(stack_bytes, idx)
        ret = u64(stack_bytes, idx + 8)
        where = sym(ret)
        print(f"  #{seen:<2} {hex(ret)}  {where or '?'}")
        if next_fp <= frame:
            break
        frame, seen = next_fp, seen + 1

for p in sys.argv[1:]:
    parse(p)
    print()
