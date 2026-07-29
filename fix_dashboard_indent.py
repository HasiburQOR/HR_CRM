with open('backend/app/services/dashboard.py', 'r') as f:
    content = f.read()

# Fix the indentation issues caused by the lunch count addition
# The blocks from line 74 onwards need to be indented with 8 more spaces

lines = content.split('\n')
fixed_lines = []
for i, line in enumerate(lines):
    line_num = i + 1
    
    # Lines that need +8 spaces (the if/else blocks that were de-indented)
    if line_num >= 74 and line_num <= 460:
        # Check if line starts with specific patterns that need fixing
        if line.startswith('if is_employee and emp:') or \
           line.startswith('else:') and 'pending_' in lines[line_num] or \
           line.startswith('if is_employee and emp:') and 'pending_' in line or \
           line.startswith('if is_employee and emp:') and 'active_reminders' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'inventory_' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'monthly_payroll' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'department_distribution' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'attendance_trend' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'recent_activities' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'pending_leaves_list' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'pending_expenses_list' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'pending_salaries_list' in lines[line_num+1] or \
           line.startswith('if is_employee and emp:') and 'pending_tasks_list' in lines[line_num+1]:
            fixed_lines.append('        ' + line)
        elif line.startswith('    pending_') or \
             line.startswith('    active_reminders') or \
             line.startswith('    inventory_') or \
             line.startswith('    monthly_payroll') or \
             line.startswith('    department_distribution') or \
             line.startswith('    attendance_trend') or \
             line.startswith('    recent_activities') or \
             line.startswith('    pending_leaves_list') or \
             line.startswith('    pending_expenses_list') or \
             line.startswith('    pending_salaries_list') or \
             line.startswith('    pending_tasks_list'):
            fixed_lines.append('            ' + line)
        else:
            fixed_lines.append(line)
    else:
        fixed_lines.append(line)

with open('backend/app/services/dashboard.py', 'w') as f:
    f.write('\n'.join(fixed_lines))

print("Fixed indentation")
