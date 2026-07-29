with open('frontend/src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={refreshing === `leave-${r.id}`}
                            onClick={() => approveLeave(r.id)}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={refreshing === `leave-${r.id}`}
                            onClick={() => rejectLeave(r.id)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>'''

new = '''                      <TableCell className="text-right">
                        {!isEmployee && (
                          <div className="inline-flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={refreshing === `leave-${r.id}`}
                              onClick={() => approveLeave(r.id)}
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={refreshing === `leave-${r.id}`}
                              onClick={() => rejectLeave(r.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>'''

if old in content:
    content = content.replace(old, new, 1)
    with open('frontend/src/pages/Dashboard.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced leaves actions')
else:
    print('Old string not found')
