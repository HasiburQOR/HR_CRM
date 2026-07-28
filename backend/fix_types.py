import os
import glob

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Replace any with Any
    content = content.replace(': any =', ': Any =')
    content = content.replace('-> any:', '-> Any:')
    
    if content != original:
        # add import if needed
        if 'from typing import' not in content and 'import typing' not in content:
            # find first import
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if line.startswith('from ') or line.startswith('import '):
                    lines.insert(i, 'from typing import Any')
                    break
            else:
                lines.insert(0, 'from typing import Any')
            content = '\n'.join(lines) + '\n'
        elif 'from typing import' in content and 'Any' not in content.split('from typing import')[1].split('\n')[0]:
            content = content.replace('from typing import ', 'from typing import Any, ')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

if __name__ == '__main__':
    for py_file in glob.glob('app/**/*.py', recursive=True):
        fix_file(py_file)
