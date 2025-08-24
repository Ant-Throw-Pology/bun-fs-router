interface RegExpConstructor {
  /**
   * The RegExp.escape() static method escapes any potential regex syntax
   * characters in a string, and returns a new string that can be safely used
   * as a literal pattern for the RegExp() constructor.
   *
   * When dynamically creating a RegExp with user-provided content, consider
   * using this function to sanitize the input (unless the input is actually
   * intended to contain regex syntax). In addition, don’t try to re-implement
   * its functionality by, for example, using String.prototype.replaceAll() to
   * insert a \ before all syntax characters. RegExp.escape() is designed to
   * use escape sequences that work in many more edge cases/contexts than
   * hand-crafted code is likely to achieve.
   *
   * @param string The string to escape.
   */
  escape(string: string): string;
}
