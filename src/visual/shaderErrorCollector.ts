export interface ShaderErrorRecord {
  shaderType: string;
  message: string;
  summary: string;
}

export class ShaderErrorCollector {
  private errors: ShaderErrorRecord[] = [];

  collect(
    _gl: WebGLRenderingContext,
    _shader: WebGLShader,
    shaderType: string,
    message: string,
  ): void {
    const truncated = message.length > 200 ? message.slice(0, 200) + '…' : message;
    this.errors.push({
      shaderType,
      message,
      summary: `[${shaderType}] ${truncated}`,
    });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): ShaderErrorRecord[] {
    return this.errors.slice();
  }

  clear(): void {
    this.errors = [];
  }
}
