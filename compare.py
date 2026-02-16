# Lire les deux fichiers
copie = {}
with open('c:/Users/Romann/Desktop/Codage/magicGarden - Copie/copie_files.txt') as f:
    for line in f:
        parts = line.strip().split(' ', 1)
        if len(parts) == 2:
            copie[parts[1]] = int(parts[0])

original = {}
with open('C:/Users/Romann/Desktop/Codage/magicGarden/original_files.txt') as f:
    for line in f:
        parts = line.strip().split(' ', 1)
        if len(parts) == 2:
            original[parts[1]] = int(parts[0])

# Trouver les fichiers communs avec tailles différentes
print("=== DIFFÉRENCES DE TAILLE (fichiers communs) ===\n")
common_files = set(copie.keys()) & set(original.keys())
different = []

for file in sorted(common_files):
    size_copie = copie[file]
    size_original = original[file]
    if size_copie != size_original:
        diff = size_original - size_copie
        different.append((file, size_copie, size_original, diff))

if different:
    for file, sc, so, diff in different:
        sign = '+' if diff > 0 else ''
        print(f"{file:60} | Copie: {sc:8} bytes | Original: {so:8} bytes | Diff: {sign}{diff:8} bytes")
else:
    print("Aucune différence de taille pour les fichiers communs")

print(f"\n\nTotal fichiers avec tailles différentes: {len(different)}")
