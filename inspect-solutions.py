from pathlib import Path
s=Path('/home/ubuntu/pacca-vision/client/src/pages/Home.tsx').read_text()
start=s.index('function SolutionsPage')
end=s.index('function ConfigListPage', start)
print(s[start:end])
